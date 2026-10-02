// Tedarik fiyat taraması (otomatik): Windows Görev Zamanlayıcı her sabah çalıştırır.
//
// Amazon sayfaları Node'dan çekilince engelleniyor; bu yüzden bilgisayardaki Chrome, ayrı bir profille açılır ve
// amazon-scan skill'inin tarayıcı betiği (aynı kökenli fetch, 2 kanal, sayfa arası 1,2–2,7 sn) sayfaya yüklenir.
// Profilde kullanıcı bir kez giriş yapar (--login); oturum haftalarca açık kalır.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/supply_scan.mjs --login
//   node … scripts/supply_scan.mjs --channel amazon-de[,amazon-pl][,ceneo] [--limit 20] [--dry-run] [--headed]
//
// Taramadan önce referans sayfada CAPTCHA, oturum ve teslimat adresi (Amazon.de'de ayrıca KDV hariç fiyat)
// kontrol edilir; biri tutmazsa o kanal taranmaz. CAPTCHA asla çözülmez. Sonuç kanalın içe aktarma script'iyle
// yazılır; fiyatı %50'den fazla oynayan ürün yazılmaz. Her kanalın her çalışması SupplyScanRun tablosuna kaydedilir.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { PrismaClient } from '@prisma/client';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const has = (name) => process.argv.includes(name);

const PROFILE = path.join(os.homedir(), '.efa-scanner', 'chrome-profile');
const OUT_DIR = path.join(process.cwd(), 'data', 'supply-scans');
const SCAN_JS = path.join(process.cwd(), '.claude', 'skills', 'amazon-scan', 'browser.js');
/** Business oturumunda KDV hariç fiyatı gösteren, iki sitede de açılan bir ürün (EP5447/90) */
const REF_ASIN = 'B08CBJ8W9W';
const MAX_SCAN_MS = 60 * 60 * 1000;
const STORE = 'store1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const log = (...a) => console.log(new Date().toLocaleTimeString('tr-TR'), ...a);

function openContext(headed) {
  fs.mkdirSync(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: !headed,
    viewport: { width: 1366, height: 900 },
    locale: 'de-DE',
  });
}

// ── Bir kerelik giriş: pencere açılır, kullanıcı Amazon.de Business'a ve amazon.pl'ye girer, pencereyi kapatır.
if (has('--login')) {
  const ctx = await openContext(true);
  const de = ctx.pages()[0] ?? (await ctx.newPage());
  await de.goto('https://www.amazon.de/');
  const pl = await ctx.newPage();
  await pl.goto('https://www.amazon.pl/');
  console.log(
    'Açılan pencerede:\n' +
      '  1. amazon.de sekmesinde Amazon Business hesabınla giriş yap, teslimat adresini Cybinka (Polonya) seç.\n' +
      '  2. amazon.pl sekmesinde giriş yap.\n' +
      'Bitince pencereyi kapat; oturum bu profilde saklanır: ' + PROFILE
  );
  await new Promise((r) => ctx.on('close', r));
  process.exit(0);
}

/** Referans sayfayı açar; CAPTCHA ve sayfa kontrolü ortak, oturum ve teslimat kontrolü kanala göre. */
async function openRef(page, origin) {
  await page.goto(`${origin}/dp/${REF_ASIN}?th=1&psc=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const s = await page.evaluate(() => ({
    captcha: location.pathname.includes('validateCaptcha') || !!document.querySelector('form[action*="validateCaptcha"]'),
    title: !!document.querySelector('#productTitle'),
    account: document.querySelector('#nav-link-accountList-nav-line-1')?.textContent?.trim() ?? '',
    deliver: (document.querySelector('#glow-ingress-line2') ?? document.querySelector('#glow-ingress-block'))?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    net: !!document.querySelector('.priceblock_vat_excl_price'),
  }));
  if (s.captcha) return { s, problem: 'Amazon CAPTCHA istiyor (çözülmez; birkaç saat sonra kendiliğinden kalkar)' };
  if (!s.title) return { s, problem: 'Amazon sayfası açılmadı (engel ya da bağlantı sorunu)' };
  return { s, problem: null };
}

const CHANNELS = {
  'amazon-de': {
    origin: 'https://www.amazon.de',
    runFn: '__runScan',
    importScript: 'scripts/asin_source_import.mjs',
    importArgs: ['--prices-only'],
    /** Sorun yoksa null, varsa okunur açıklama */
    check(s) {
      // Business üst menüsünde hesap alanı yok; varsa ve "Anmelden" diyorsa oturum kapalıdır. Asıl kanıt aşağıdaki
      // iki kontrol: oturum kapanınca teslimat adresi ve KDV hariç fiyat da kaybolur.
      if (/anmelden|sign in|giriş/i.test(s.account)) return `Amazon.de oturumu kapalı ("${s.account}") — --login ile yeniden giriş gerekli`;
      if (!/cybinka/i.test(s.deliver)) return `Teslimat adresi Cybinka değil ("${s.deliver}") — oturum kapanmış olabilir, --login ile kontrol et`;
      if (!s.net) return 'KDV hariç fiyat görünmüyor (Business oturumu açık değil olabilir)';
      return null;
    },
  },
  'amazon-pl': {
    origin: 'https://www.amazon.pl',
    runFn: '__runScanPl',
    importScript: 'scripts/amazon_pl_import.mjs',
    importArgs: [],
    // amazon.pl'de hesap Business değil; oturum "Cześć <ad>" ile, teslimat aynı posta koduyla (69108) görünür
    check(s) {
      if (!s.account || /zaloguj/i.test(s.account)) return `amazon.pl oturumu kapalı ("${s.account}") — --login ile yeniden giriş gerekli`;
      if (!/69108/.test(s.deliver)) return `amazon.pl teslimat adresi 69108 değil ("${s.deliver}")`;
      return null;
    },
  },
  ceneo: { importScript: 'scripts/ceneo_import.mjs', importArgs: [] },
};

async function scan(channel, cfg, run, { limit, headed }) {
  const rows = await run.prisma.productSource.findMany({ where: { storeId: STORE, asin: { not: null } }, select: { asin: true } });
  let asins = [...new Set(rows.map((r) => r.asin))];
  if (limit) asins = asins.slice(0, limit);
  await run.update({ total: asins.length });

  const ctx = await openContext(headed);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const { s, problem } = await openRef(page, cfg.origin);
    const p = problem ?? cfg.check(s);
    if (p) throw new Error(p);
    log(`${channel}: kontrol tamam, ${asins.length} ASIN taranıyor`);

    await page.evaluate(fs.readFileSync(SCAN_JS, 'utf8'));
    await page.evaluate(([fn, list]) => window[fn](list), [cfg.runFn, asins]);
    const started = Date.now();
    let lastLog = 0;
    for (;;) {
      await sleep(10_000);
      const j = await page.evaluate(() => ({ done: window.__job.done, total: window.__job.total, finished: window.__job.finished }));
      if (Date.now() - lastLog > 60_000) {
        log(`${channel}: ilerleme ${j.done}/${j.total}`);
        lastLog = Date.now();
      }
      if (j.finished) break;
      if (Date.now() - started > MAX_SCAN_MS) throw new Error(`Tarama ${MAX_SCAN_MS / 60000} dakikada bitmedi (${j.done}/${j.total})`);
    }
    const job = await page.evaluate(() => ({ results: window.__job.results, streak: window.__job.blockedStreak }));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${channel}_${today()}.json`);
    fs.writeFileSync(file, JSON.stringify(job.results));
    log(`${channel}: tarama bitti, ${job.results.length} sayfa → ${file}`);
    // Amazon üst üste 3 sayfayı engellediyse kuyruk durur; okunanlar yine yazılır, eksikler eski değerinde kalır
    const blockedStop = job.streak >= 3 ? 'Amazon taramanın ortasında engelledi; okunamayanlar eski değerinde kaldı' : null;
    return { file, blockedStop };
  } finally {
    await ctx.close();
  }
}

// ── Ceneo: kullanıcının Python motoru (C:\Users\furka\ceneo\scan_offers.py), IPRoyal ile her worker ayrı IP.
// Yalnız Ceneo'ya bağlı ürünler (EXACT / MANUAL) taranır; arama yapılmaz, kullanıcının kararları değişmez.
// IPRoyal trafiği ücretli: ürün başına ~0,2 MB (2026-10-01 ölçümü), tam tarama ~80 MB.
const CENEO_DIR = path.join(os.homedir(), 'ceneo');

async function scanCeneo(run, { limit }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tasksFile = path.join(OUT_DIR, `ceneo-tasks_${today()}.json`);
  const t = spawnSync(process.execPath, ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', 'scripts/ceneo_tasks.mjs'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (t.status !== 0) throw new Error(`Ceneo görev listesi çıkarılamadı: ${t.stderr?.slice(0, 300)}`);
  fs.writeFileSync(tasksFile, t.stdout);
  const linked = JSON.parse(t.stdout).filter((x) => x.ceneoId).length;
  const total = limit ? Math.min(limit, linked) : linked;
  await run.update({ total });
  log(`ceneo: ${total} bağlı ürün taranıyor (IPRoyal, ~${Math.round(total * 0.2)} MB)`);

  const file = path.join(OUT_DIR, `ceneo_${today()}.json`);
  if (fs.existsSync(file)) fs.rmSync(file);
  const py = spawnSync(
    'python',
    ['scan_offers.py', '--tasks', tasksFile, '--out', file, '--workers', '5', ...(limit ? ['--limit', String(limit)] : [])],
    { cwd: CENEO_DIR, stdio: 'inherit', timeout: MAX_SCAN_MS }
  );
  if (py.error) throw new Error(`Ceneo taraması başlatılamadı: ${py.error.message}`);
  if (py.status !== 0) throw new Error(`Ceneo taraması hata verdi (çıkış kodu ${py.status})`);
  if (!fs.existsSync(file)) throw new Error('Ceneo taraması sonuç üretmedi (proxy ayarı ya da engel)');

  // Engellenenler (Cloudflare kontrol sayfası) bir kez daha: aradan zaman geçer, yeni oturumlar = yeni IP'ler.
  // Kontrol sayfası çözülmez; ikinci turda da takılan ürün bir sonraki taramaya kalır.
  const tasks = JSON.parse(t.stdout).filter((x) => x.ceneoId).slice(0, total);
  const done = new Set(JSON.parse(fs.readFileSync(file, 'utf8')).map((r) => String(r.id)));
  const missing = tasks.map((x) => String(x.id)).filter((id) => !done.has(id));
  if (missing.length) {
    log(`ceneo: ${missing.length} ürün engellendi, 2 dakika sonra yeni IP'lerle bir kez daha denenecek`);
    await sleep(120_000);
    const idsFile = path.join(OUT_DIR, `ceneo-retry_${today()}.json`);
    fs.writeFileSync(idsFile, JSON.stringify(missing));
    spawnSync(
      'python',
      ['scan_offers.py', '--tasks', tasksFile, '--out', file, '--ids', idsFile, '--workers', String(Math.min(5, missing.length))],
      { cwd: CENEO_DIR, stdio: 'inherit', timeout: MAX_SCAN_MS }
    );
  }
  const scanned = JSON.parse(fs.readFileSync(file, 'utf8')).length;
  // Engellenen ürünler dosyaya girmez: eksik kalanlar eski tekliflerinde kalır
  const blockedStop = scanned < total ? `Ceneo ${total - scanned} ürünü engelledi; onlar eski tekliflerinde kaldı` : null;
  log(`ceneo: tarama bitti, ${scanned}/${total} ürün → ${file}`);
  return { file, blockedStop, total };
}

function importScan(cfg, file, dryRun) {
  const summaryFile = file.replace(/\.json$/, '.summary.json');
  const res = spawnSync(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      '--env-file-if-exists=.env.local',
      cfg.importScript,
      file,
      ...cfg.importArgs,
      '--max-change',
      '0.5',
      '--summary',
      summaryFile,
      ...(dryRun ? ['--dry-run'] : []),
    ],
    { stdio: 'inherit' }
  );
  if (res.status !== 0) throw new Error(`İçe aktarma hata verdi (çıkış kodu ${res.status})`);
  return JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
}

// --channel amazon-de,amazon-pl → sırayla; biri hata verse de diğeri çalışır, her biri kendi kaydını açar
const channels = (arg('--channel') ?? 'amazon-de').split(',');
for (const c of channels) if (!CHANNELS[c]) throw new Error(`Desteklenmeyen kanal: ${c}`);
const opts = { limit: Number(arg('--limit')) || null, dryRun: has('--dry-run'), headed: has('--headed') };

const prisma = new PrismaClient();
let exitCode = 0;
for (const channel of channels) {
  const cfg = CHANNELS[channel];
  const row = await prisma.supplyScanRun.create({ data: { channel, status: 'running', summary: { dryRun: opts.dryRun, limit: opts.limit } } });
  const run = { prisma, update: (data) => prisma.supplyScanRun.update({ where: { id: row.id }, data }) };
  try {
    const { file, blockedStop, total } = channel === 'ceneo' ? await scanCeneo(run, opts) : await scan(channel, cfg, run, opts);
    const s = importScan(cfg, file, opts.dryRun);
    // Okunamayan %5'i aşar ya da bekletilen ürün varsa göz atmak gerekir
    const partial = blockedStop || s.unreadable > s.total * 0.05 || s.held > 0;
    await run.update({
      status: partial ? 'partial' : 'ok',
      finishedAt: new Date(),
      // Ceneo'da engellenen ürünler sonuç dosyasına girmez; toplam taramanın kendi sayısıdır
      total: total ?? s.total,
      scanned: s.scanned,
      unreadable: s.unreadable,
      priceChanged: s.priceChanged,
      stockChanged: s.stockChanged,
      held: s.held,
      error: blockedStop,
      summary: { ...s, dryRun: opts.dryRun, limit: opts.limit, file },
    });
    log(`${channel}: ${partial ? 'partial' : 'ok'} — okunan ${s.scanned}/${s.total}, fiyat değişen ${s.priceChanged}, stok değişen ${s.stockChanged}, bekletilen ${s.held}`);
  } catch (e) {
    exitCode = 1;
    await run.update({ status: 'error', finishedAt: new Date(), error: String(e.message ?? e).slice(0, 500) });
    log(`${channel}: HATA:`, e.message ?? e);
  }
}
await prisma.$disconnect();
process.exit(exitCode);

---
name: amazon-scan
description: Amazon.de'den ürün bilgisi çekme ve Ozon ürünlerinin ASIN'lerini doğrulama. Uygulamanın tarayıcısında (built-in browser) Amazon Business oturumuyla ASIN sayfalarını okur — model numarası, marka, KDV hariç/dahil fiyat, stok, satıcı, görsel galerisi — ve sonucu ProductSource tablosuna yazar. Kullan: ASIN doğrulama, ASIN'i olmayan ürüne Amazon'da ASIN arama, Amazon fiyat/stok tazeleme, kâr hesabı için alış fiyatı, Ozon kartı görsellerini Amazon galerisiyle karşılaştırma.
---

# Amazon tarama (ASIN doğrulama, fiyat, stok)

Amazon.de sayfaları Node'dan çekilince kısa sürede engelleniyor; uygulamanın tarayıcısında amazon.de
sekmesinden aynı kökenli `fetch('/dp/ASIN')` ile okununca engellenmiyor (390 sayfa, sıfır engel).
Kullanıcının tarayıcıda **Amazon Business** hesabı açık, teslimat **Polonya**, para birimi **€**:
sayfa hem KDV hariç hem KDV dahil fiyatı gösterir. Yapay zekâ yok, maliyet 0.

Veri `ProductSource` tablosunda durur (`prisma/schema.prisma`): Ozon ürünü ↔ ASIN, doğrulama durumu,
Amazon fiyatı/stoğu. Kullanıcının kararları `/asin-kontrol` sayfasından verilir.

## Durumlar (asinStatus)

| Durum | Anlamı |
|---|---|
| VERIFIED | Amazon teknik tablosundaki model/parça no. Ozon koduyla birebir, marka tutuyor, görsel ve paket adedi uyumlu |
| LIKELY | Yalnız ek farkı (Tefal K13304 ↔ K1330404) ya da kod yalnız başlıkta |
| MODEL_MISMATCH | Amazon'un model no.'su farklı |
| SUSPECT | Marka farklı, ya da model birebir ama görsel/paket adedi farklı |
| MISSING / UNREADABLE | ASIN yok / sayfa okunamadı |
| MANUAL / NOT_ON_AMAZON / ARCHIVED | Kullanıcı kararı; taramalar bunları ezmez |

## Akış

1. **Tarayıcıyı hazırla:** `navigate` → `https://www.amazon.de/dp/B08CBJ8W9W`. Sayfanın Business
   oturumu açık ve teslimat Polonya olmalı (üstte "Polonya", fiyatlarda "KDV hariç"). Değilse
   kullanıcıdan ayarlamasını iste; hesap ayarını kendin değiştirme.
2. **Betiği yükle:** `browser.js` içeriğini `javascript_tool` ile olduğu gibi çalıştır → `"amazon-scan yüklendi"`.
3. **ASIN listesi:** Tablodan ya da Ozon'dan çıkar (ör. `prisma.productSource.findMany({ where: { asin: { not: null } } })`).
4. **Tara:** `window.__runScan([...asins])` → arka planda başlar. `javascript_tool` 45 sn'de keser; ilerlemeyi
   `({done: __job.done, total: __job.total, finished: __job.finished, streak: __job.blockedStreak})` ile izle,
   aralarda `computer` `wait` kullan. Hız: ~30 sayfa/dk.
5. **İndir:** Dosya indirmek kullanıcı iznine bağlı — adı, kaynağı (kendi taramamız) ve boyutu söyleyip sor.
   `window.__download('asin_scan_YYYY-MM-DD.json', __job.results)`. Dosya İndirilenler'e bazen rastgele adlı
   `.tmp` olarak düşer; boyutu `__download`'ın döndürdüğüyle eşleşiyorsa odur, scratchpad'e kopyala.
6. **Tabloya yaz:**
   ```
   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/asin_source_import.mjs <dosya.json> [--dry-run]
   ```
   Önce `--dry-run` ile durum sayılarına bak. Script Ozon'dan ürünleri, parça numarasını (4381), paket adedini
   ve ana görseli kendisi çeker; görselleri kenar kırpılmış dHash ile karşılaştırır.
7. **ASIN'i olmayan / yanlış olanlar için ara:**
   `window.__runSearch([{ id: ozonProductId, brand, code }])` (kod gerçek model kodu değilse `isName: true`).
   Bitince `window.__download('search.json', window.__searchExport())`, sonra
   `node … scripts/asin_source_search_apply.mjs <search.json>` ve 6. adımı eski tarama + `scans` birleşik dosyayla tekrarla.
8. **Kalanlar kullanıcıya:** `/asin-kontrol` sayfası (onayla / doğru ASIN gir / Amazon'da yok).

## Haftalık fiyat/stok tazeleme

Aynı tarama (4. adım), yazarken yalnız fiyat/stok/satıcı/ağırlık: ASIN durumları ve kullanıcı kararları değişmez,
değişenler listelenir.
```
node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/asin_source_import.mjs <tarama.json> --prices-only [--dry-run]
```
Tarayıcıda Amazon oturumu kapanabiliyor (2026-10-01: "Giriş yap", teslimat Türkiye): taramadan önce hesap adı ve
teslimat "Cybinka" kontrol edilir.

## Otomatik günlük tarama (2026-10-03'ten beri)

Fiyat/stok tazeleme artık elle yapılmıyor: Windows Görev Zamanlayıcı ("EFA tedarik taraması", her gün 07:00)
`scripts/supply_scan_daily.ps1` → `scripts/supply_scan.mjs` çalıştırır. Script bu klasördeki `browser.js`'i kendi
Chrome profiline (`~/.efa-scanner/chrome-profile`, Playwright) yükler; Amazon.de + amazon.pl her gün, Ceneo pazartesi.
Sonuç `SupplyScanRun` tablosunda ve /fiyat-onerisi'nin üstünde. Oturum düşerse kullanıcı
`node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/supply_scan.mjs --login` ile açılan pencerede
giriş yapar. Elle tarama: `… scripts/supply_scan.mjs --channel amazon-de [--limit 20] [--dry-run]`.
`browser.js`'i değiştirirken otomatik taramayı da bozabileceğini unutma (`__runScan`, `__runScanPl`, `__job`).

## Amazon.pl (3. tedarik kanalı)

Aynı ASIN'ler amazon.pl'de de açılır (model kodu Polonya ekiyle yazılabilir: G713SB74 ↔ G713SB45). Hesap orada
Business değil: fiyat yalnız **%23 KDV dahil zloti**; satıcı "Sprzedawca / Wysyłka" alanında. amazon.pl sekmesinde
`browser.js` yüklenir, `window.__runScanPl([...asins])`, indirilir, sonra:
```
node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/amazon_pl_import.mjs <tarama.json> [--dry-run]
```
`ProductSource.pl*` alanlarına yazar; Amazon.de ile euroya (ECB) çevirip karşılaştırır. 404 = ürün amazon.pl'de yok.

## Kurallar ve tuzaklar

- **Kanıt model numarasıdır, görsel değil.** Birçok Ozon kartı kardeş modelin fotoğraflarıyla yüklenmiş
  (NA552/00 ↔ NA550/00, S5889/50 ↔ S5465/18, 0761406380'in yalnız ana görseli). Görsel benzerliği yalnız
  "kart doğru ürünü mü gösteriyor" sorusu içindir.
- **Kart karışıksa özelliklere göre karar ver** (kullanıcı kuralı): görsel ile özellikler çelişirse kart,
  özelliklerin girildiği modele göre düzeltilir. Özellikler: `/v4/product/info/attributes` + adları için
  `/v1/description-category/attribute`.
- **Aramada marka kontrolü şart:** aynı kodu taşıyan başka marka "uyumlu" ürünler çıkar (XV1653/01 → Aofonchy batarya).
- **Kod eşleştirme:** WMF'de baştaki 0 düşebilir (0733706299 ↔ 733706299); başlıktan kalma offer_id'lerde kod
  parantez içindedir ("Profi 28 cm (0794689991)"); Amazon bazen model alanına yanlış kod yazar
  (B0D4Q8QFTH: model NA552/00, parça NA352/00) — iki alana da bak.
- **Fiyat:** yalnız "Neu" teklif satırı (`#apex_desktop_newAccordionRow`); ikinci satır ikinci el/Retourenkauf.
  KDV oranı ürüne göre %19 ya da %23 — hesaplama, sayfadaki iki fiyatı olduğu gibi al.
- **Satıcı:** yalnız `Amazon` Amazon'dur; "Amazon Retourenkauf" iade ürünüdür. Kaynak kuralı: yalnız Amazon'un
  kendi sattığı ürün alınır.
- **Stok:** "Nur noch N auf Lager" az stoktur (yanında "mehr ist unterwegs" yoksa); "Versandbereit in 1-2 Tagen"
  stoktur; fiyat/sepet düğmesi yoksa ürün alınamıyor.
- **Paket adedi:** Amazon başlıkları çoğu zaman adet yazmaz, paket model numarasına gömülüdür (CA6903/22 = 2'li);
  yalnız Amazon açıkça yazıp Ozon'dan farklıysa uyar.
- **Sekmeye dokunma:** tarama sürerken sekme başka adrese giderse fonksiyonlar kaybolur, iş yarım kalır.
- **Ozon'a yazmak** (görsel, stok, arşiv) ayrı bir karardır; kullanıcı söylemeden yapma. Tarifler için
  `ozon-api-card-lessons` hafızası: ana görsel değiştirmek 4194 "другой товар" riski taşır.

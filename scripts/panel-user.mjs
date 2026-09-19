/**
 * Panel kullanıcısı oluşturur ya da şifresini değiştirir.
 *
 *   npm run kullanici              → sorular sorulur
 *   npm run kullanici -- --liste   → kayıtlı kullanıcıları gösterir
 *   npm run kullanici -- --sil furkan
 *
 * Şifre ekrana yazılmaz ve veritabanına düz metin olarak kaydedilmez;
 * yalnızca scrypt özeti saklanır (src/lib/auth/password.ts).
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/lib/auth/password.ts';

const prisma = new PrismaClient();

/** Şifre girilirken ekranda görünmesin. */
async function askSecret(question) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const promise = rl.question(question);
  rl.output.write = ((write) => (chunk, ...rest) => {
    if (rl.line.length && String(chunk).trim() && !String(chunk).startsWith(question)) return true;
    return write.call(rl.output, chunk, ...rest);
  })(rl.output.write);
  const answer = await promise;
  rl.close();
  stdout.write('\n');
  return answer;
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function list() {
  const users = await prisma.panelUser.findMany({ orderBy: { username: 'asc' } });
  if (!users.length) {
    console.log('Kayıtlı kullanıcı yok. `npm run kullanici` ile bir kullanıcı oluşturun.');
    return;
  }
  console.log(`${users.length} kullanıcı:`);
  for (const u of users) {
    const last = u.lastLoginAt ? u.lastLoginAt.toLocaleString('tr-TR') : 'hiç giriş yapılmadı';
    console.log(`  • ${u.username}  (son giriş: ${last})`);
  }
}

async function remove(username) {
  const deleted = await prisma.panelUser.deleteMany({ where: { username: username.trim().toLowerCase() } });
  console.log(deleted.count ? `"${username}" silindi.` : `"${username}" bulunamadı.`);
}

async function upsert() {
  const usernameRaw = await ask('Kullanıcı adı: ');
  const username = usernameRaw.trim().toLowerCase();
  if (!username || /\s/.test(username)) {
    console.error('Kullanıcı adı boş olamaz ve boşluk içeremez.');
    exit(1);
  }

  const existing = await prisma.panelUser.findUnique({ where: { username } });
  if (existing) console.log(`"${username}" zaten var; şifresi değiştirilecek.`);

  const password = await askSecret('Şifre (ekranda görünmez): ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
    exit(1);
  }
  const again = await askSecret('Şifre (tekrar): ');
  if (password !== again) {
    console.error('Şifreler aynı değil.');
    exit(1);
  }

  const passwordHash = await hashPassword(password);
  await prisma.panelUser.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(existing ? `"${username}" kullanıcısının şifresi değiştirildi.` : `"${username}" kullanıcısı oluşturuldu.`);
}

try {
  const args = argv.slice(2);
  if (args.includes('--liste')) {
    await list();
  } else if (args.includes('--sil')) {
    const username = args[args.indexOf('--sil') + 1];
    if (!username) {
      console.error('Kullanım: npm run kullanici -- --sil <kullanıcı adı>');
      exit(1);
    }
    await remove(username);
  } else {
    await upsert();
  }
} catch (err) {
  console.error('Hata:', err.message);
  exit(1);
} finally {
  await prisma.$disconnect();
}

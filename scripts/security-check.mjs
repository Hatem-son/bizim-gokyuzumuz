import fs from 'node:fs';
import path from 'node:path';

function loadEnvFiles() {
  const env = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const file = path.resolve(name);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnvFiles();
const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
const TEST_EMAIL = env.TEST_EMAIL || '';
const TEST_PASSWORD = env.TEST_PASSWORD || '';
const TEST_SIGNED_URL = env.TEST_SIGNED_URL || process.argv[2] || '';

let passed = 0;
let failed = 0;

function report(label, ok, detail) {
  if (ok) passed++;
  else failed++;
  const tag = ok ? 'GEÇTİ' : 'KALDI';
  console.log(`[${tag}] ${label} — ${detail}`);
}

async function checkAnonTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON error response
  }

  if (res.status === 401 || res.status === 403) {
    report(`Anonim REST okuma (${table})`, true, `HTTP ${res.status} reddedildi`);
    return;
  }
  if (res.ok && Array.isArray(json) && json.length === 0) {
    report(`Anonim REST okuma (${table})`, true, 'HTTP 200 ancak RLS nedeniyle boş ([]) döndü');
    return;
  }
  report(
    `Anonim REST okuma (${table})`,
    false,
    `HTTP ${res.status} — beklenmeyen veri döndü: ${text.slice(0, 140)}`
  );
}

async function checkAnonStorage() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/media`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: '' }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  const ok =
    res.status === 400 ||
    res.status === 401 ||
    res.status === 403 ||
    res.status === 404 ||
    (res.ok && Array.isArray(json) && json.length === 0);
  report(`Anonim Storage listeleme (media)`, ok, `HTTP ${res.status} ${text.slice(0, 100)}`);
}

async function checkSignupDisabled() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: `blocked-check-${Date.now()}@example.com`,
      password: 'SecurityCheckPass!2026',
    }),
  });
  const text = await res.text();
  const blocked = !res.ok && (res.status === 400 || res.status === 403 || res.status === 422);
  report(
    'Yeni kullanıcı kaydı (signup) kapalı mı',
    blocked,
    blocked ? `HTTP ${res.status} ile reddedildi` : `HTTP ${res.status} — DİKKAT: kayıt açık olabilir (${text.slice(0, 120)})`
  );
}

async function checkSignedUrlExpiry() {
  let signedUrl = TEST_SIGNED_URL;

  if (!signedUrl && TEST_EMAIL && TEST_PASSWORD) {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const authData = await authRes.json().catch(() => ({}));
    const token = authData.access_token;
    if (!authRes.ok || !token) {
      report('İmzalı URL 60 sn süre testi', false, `TEST_EMAIL girişi başarısız (HTTP ${authRes.status})`);
      return;
    }

    const mediaRes = await fetch(
      `${SUPABASE_URL}/rest/v1/stars?select=id&has_media=eq.true&spent=eq.false&limit=1`,
      {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const stars = await mediaRes.json().catch(() => []);
    if (!Array.isArray(stars) || stars.length === 0) {
      report(
        'İmzalı URL 60 sn süre testi',
        false,
        'Hesapta henüz medyası olan yıldız yok; önce 1 fotoğraf/ses yıldızı bırakıp tekrar deneyin'
      );
      return;
    }

    const starId = stars[0].id;
    const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/media/${starId}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    const signData = await signRes.json().catch(() => ({}));
    if (!signRes.ok || !signData.signedURL) {
      report('İmzalı URL 60 sn süre testi', false, `İmzalı URL üretilemedi (HTTP ${signRes.status})`);
      return;
    }
    signedUrl = signData.signedURL.startsWith('http')
      ? signData.signedURL
      : `${SUPABASE_URL}/storage/v1${signData.signedURL}`;
  }

  if (!signedUrl) {
    report(
      'İmzalı URL 60 sn süre testi',
      false,
      'Test için .env.local içine TEST_EMAIL + TEST_PASSWORD ekleyin veya argüman olarak imzalı URL verin'
    );
    return;
  }

  const before = await fetch(signedUrl);
  if (!before.ok) {
    report('İmzalı URL ilk açılış (0. sn)', false, `HTTP ${before.status} — geçerli URL açılmalıydı`);
    return;
  }
  console.log('İmzalı URL şu an açıldı (HTTP 200). Süre dolması için 62 saniye bekleniyor...');
  await new Promise((r) => setTimeout(r, 62_000));

  const after = await fetch(signedUrl);
  const expired = !after.ok && (after.status === 400 || after.status === 401 || after.status === 403 || after.status === 404);
  report(
    'İmzalı URL 60 sn sonra geçersiz mi',
    expired,
    `62 sn sonra HTTP ${after.status}`
  );
}

async function main() {
  console.log('--- Bizim Gökyüzümüz Güvenlik Denetim Betiği ---');
  if (!SUPABASE_URL || SUPABASE_URL.includes('PROJE-ID') || !ANON_KEY || ANON_KEY === 'eyJ...') {
    report(
      'Ortam değişkenleri (.env / .env.local)',
      false,
      'Geçerli VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY bulunamadı'
    );
    console.log(`\nÖzet: ${passed} GEÇTİ, ${failed} KALDI`);
    process.exitCode = 1;
    return;
  }

  await checkAnonTable('stars');
  await checkAnonTable('star_secrets');
  await checkAnonTable('profiles');
  await checkAnonTable('settings');
  await checkAnonStorage();
  await checkSignupDisabled();
  await checkSignedUrlExpiry();

  console.log(`\nÖzet: ${passed} GEÇTİ, ${failed} KALDI`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[KALDI] Beklenmeyen hata:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});


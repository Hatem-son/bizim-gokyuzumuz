// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-ignore: web-push için tip tanımı yok
import webpush from 'npm:web-push@3.6.7';

interface ProfileSubRow {
  id: string;
  who: 'hamham' | 'beto';
  push_subscription: unknown;
}

interface DueStarRow {
  id: string;
  from_user: string;
  unlock_at: string;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

interface PushRequestBody {
  mode?: string;
  kind?: string;
  once?: boolean;
  unlockAt?: string | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gokyuzu@example.com';
const ALLOWED_ORIGINS = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

const MAX_BODY_BYTES = 2048;
const ALLOWED_KINDS = new Set(['text', 'note', 'miss', 'photo', 'voice', 'draw']);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateHits = new Map<string, number[]>();

/** Kullanıcı başına dakikada en çok RATE_MAX istek (örnek başına bellek içi; kötüye kullanım freni). */
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (rateHits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateHits.set(userId, hits);
  return hits.length > RATE_MAX;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')?.trim() ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const unlockFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function formatUnlockLabel(iso: string): string {
  const txt = unlockFmt.format(new Date(iso));
  const parts = txt.split(' ');
  if (parts.length >= 3) {
    const time = parts.pop()!;
    return `${parts.join(' ')}, ${time}'te açılacak`;
  }
  return `${txt} açılacak`;
}

async function sendToProfile(
  admin: any,
  profile: { id: string; push_subscription: unknown } | null | undefined,
  payloadObj: PushPayload
): Promise<{ sent: boolean; statusCode?: number }> {
  if (!profile?.push_subscription) return { sent: false };
  try {
    await webpush.sendNotification(
      profile.push_subscription,
      JSON.stringify(payloadObj)
    );
    return { sent: true };
  } catch (pushErr: unknown) {
    const statusCode = (pushErr as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await admin.from('profiles').update({ push_subscription: null }).eq('id', profile.id);
    }
    return { sent: false, statusCode };
  }
}

async function processPendingUnlocks(
  admin: any
): Promise<{ checked: boolean; unlockedCount: number }> {
  const nowIso = new Date().toISOString();
  const { data: dueStars, error } = await admin
    .from('stars')
    .select('id, from_user, unlock_at')
    .not('unlock_at', 'is', null)
    .lte('unlock_at', nowIso)
    .eq('unlock_push_sent', false)
    .order('unlock_at', { ascending: true })
    .limit(50);

  if (error || !dueStars || dueStars.length === 0) {
    return { checked: true, unlockedCount: 0 };
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, who, push_subscription');

  const profileList = (profiles ?? []) as ProfileSubRow[];

  let sentCount = 0;
  for (const row of dueStars as DueStarRow[]) {
    const { data: claimed } = await admin
      .from('stars')
      .update({ unlock_push_sent: true })
      .eq('id', row.id)
      .eq('unlock_push_sent', false)
      .select('id')
      .maybeSingle();

    if (!claimed) continue;

    const senderProfile = profileList.find((p: ProfileSubRow) => p.id === row.from_user);
    if (!senderProfile) continue;

    const recipientWho: 'hamham' | 'beto' = senderProfile.who === 'hamham' ? 'beto' : 'hamham';
    const recipientProfile = profileList.find((p: ProfileSubRow) => p.who === recipientWho);
    const senderGen = senderProfile.who === 'hamham' ? "Ham ham'ın" : "Beto'nun";
    const recipientName = recipientWho === 'hamham' ? 'Ham ham' : 'Beto';

    await sendToProfile(admin, recipientProfile, {
      title: `${senderGen} zamanlı yıldızı açıldı`,
      body: 'Şimdi açabilirsin',
      url: '/',
    });

    await sendToProfile(admin, senderProfile, {
      title: 'Yıldızının kilidi açıldı',
      body: `${recipientName} artık açabilir`,
      url: '/',
    });

    sentCount++;
  }

  return { checked: true, unlockedCount: sentCount };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    if (ALLOWED_ORIGINS.length > 0 && !corsHeaders['Access-Control-Allow-Origin']) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: 'VAPID or Supabase env missing' }, 500, corsHeaders);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    // Tarayıcı kaynaklı istekler yalnızca izinli alan adından (APP_ORIGIN); gövde boyutu sınırlı
    const reqOrigin = req.headers.get('Origin')?.trim() ?? '';
    if (reqOrigin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(reqOrigin)) {
      return json({ error: 'Forbidden origin' }, 403, corsHeaders);
    }
    if (Number(req.headers.get('Content-Length') ?? '0') > MAX_BODY_BYTES) {
      return json({ error: 'Payload too large' }, 413, corsHeaders);
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return json({ error: 'Payload too large' }, 413, corsHeaders);
    }
    let body: PushRequestBody = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as PushRequestBody) : {};
    } catch {
      return json({ error: 'Bad request' }, 400, corsHeaders);
    }
    const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (body.mode === 'check_unlocks') {
      if (!safeEqual(jwt, SUPABASE_SERVICE_ROLE_KEY)) {
        return json({ error: 'Forbidden' }, 403, corsHeaders);
      }
      const result = await processPendingUnlocks(admin);
      return json(result, 200, corsHeaders);
    }

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return json({ error: 'Invalid token' }, 401, corsHeaders);
    }
    if (rateLimited(userData.user.id)) {
      return json({ error: 'Too many requests' }, 429, corsHeaders);
    }
    if (body.kind !== undefined && !ALLOWED_KINDS.has(String(body.kind))) {
      return json({ error: 'Bad request' }, 400, corsHeaders);
    }
    if (body.unlockAt != null && Number.isNaN(Date.parse(String(body.unlockAt)))) {
      return json({ error: 'Bad request' }, 400, corsHeaders);
    }

    const { data: senderProfile } = await admin
      .from('profiles')
      .select('id, who')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (!senderProfile) {
      return json({ error: 'Forbidden' }, 403, corsHeaders);
    }

    const senderWho = senderProfile.who as 'hamham' | 'beto';
    const recipientWho: 'hamham' | 'beto' = senderWho === 'hamham' ? 'beto' : 'hamham';
    const senderName = senderWho === 'hamham' ? 'Ham ham' : 'Beto';

    const { data: recipient } = await admin
      .from('profiles')
      .select('id, push_subscription')
      .eq('who', recipientWho)
      .maybeSingle();

    if (!recipient?.push_subscription) {
      return json({ sent: false, reason: 'no_subscription' }, 200, corsHeaders);
    }

    // İçerik bildirimde asla yer almaz
    let title = `${senderName} sana bir yıldız bıraktı`;
    let subtitle = 'Gökyüzüne yeni bir yıldız düştü';

    if (body.kind === 'draw') {
      title = `${senderName} sana bir çizim bıraktı`;
    } else if (body.kind === 'photo') {
      title = `${senderName} sana bir fotoğraf bıraktı`;
      subtitle = body.once ? 'Tek seferlik bir fotoğraf gönderdi' : 'Gökyüzüne yeni bir yıldız düştü';
    } else if (body.kind === 'voice') {
      title = `${senderName} sana sesli bir yıldız bıraktı`;
      subtitle = 'Bir ses kaydı';
    }

    if (body.unlockAt) {
      title = `${senderName} sana kilitli bir yıldız bıraktı`;
      subtitle = formatUnlockLabel(body.unlockAt);
    }

    const res = await sendToProfile(admin, recipient, {
      title,
      body: subtitle,
      url: '/',
    });

    return json(res, 200, corsHeaders);
  } catch (_err: unknown) {
    // iç hata ayrıntısı istemciye sızdırılmaz
    return json({ error: 'Unexpected error' }, 500, corsHeaders);
  }
});

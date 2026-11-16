import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gokyuzu@example.com';
const ALLOWED_ORIGINS = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')?.trim() ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.length === 1) {
    headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS[0];
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
  // Türkçe saat/tarih bitişi: "9 Ocak 00:00" -> "9 Ocak, 00:00'te açılacak"
  const parts = txt.split(' ');
  if (parts.length >= 3) {
    const time = parts.pop()!;
    return `${parts.join(' ')}, ${time}'te açılacak`;
  }
  return `${txt} açılacak`;
}

async function sendToProfile(
  admin: ReturnType<typeof createClient>,
  profile: { id: string; push_subscription: unknown } | null | undefined,
  payloadObj: { title: string; body: string; url: string }
): Promise<{ sent: boolean; statusCode?: number }> {
  if (!profile?.push_subscription) return { sent: false };
  try {
    await webpush.sendNotification(
      profile.push_subscription as webpush.PushSubscription,
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

async function processPendingUnlocks(admin: ReturnType<typeof createClient>) {
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

  const byId = new Map<string, { id: string; who: 'hamham' | 'beto'; push_subscription: unknown }>();
  const byWho = new Map<'hamham' | 'beto', { id: string; who: 'hamham' | 'beto'; push_subscription: unknown }>();
  for (const p of (profiles ?? []) as { id: string; who: 'hamham' | 'beto'; push_subscription: unknown }[]) {
    byId.set(p.id, p);
    byWho.set(p.who, p);
  }

  let sentCount = 0;
  for (const row of dueStars as { id: string; from_user: string; unlock_at: string }[]) {
    // Atomik sahiplenme: iki eşzamanlı cron tetiklemesinde aynı bildirimin iki kez gitmesini önler
    const { data: claimed } = await admin
      .from('stars')
      .update({ unlock_push_sent: true })
      .eq('id', row.id)
      .eq('unlock_push_sent', false)
      .select('id')
      .maybeSingle();

    if (!claimed) continue;

    const senderProfile = byId.get(row.from_user);
    if (!senderProfile) continue;
    const recipientWho = senderProfile.who === 'hamham' ? 'beto' : 'hamham';
    const recipientProfile = byWho.get(recipientWho);
    const senderName = senderProfile.who === 'hamham' ? 'Ham ham' : 'Beto';
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

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    if (ALLOWED_ORIGINS.length > 0 && !corsHeaders['Access-Control-Allow-Origin']) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'VAPID or Supabase env missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      kind?: string;
      once?: boolean;
      unlockAt?: string | null;
    };

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // pg_cron veya sunucu tarafından çağrılan zamanlı kilit açma kontrolü
    if (body.mode === 'check_unlocks') {
      if (jwt !== SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const result = await processPendingUnlocks(admin);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: senderProfile } = await admin
      .from('profiles')
      .select('id, who')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (!senderProfile) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const senderWho = senderProfile.who as 'hamham' | 'beto';
    const recipientWho = senderWho === 'hamham' ? 'beto' : 'hamham';
    const senderName = senderWho === 'hamham' ? 'Ham ham' : 'Beto';

    const { data: recipient } = await admin
      .from('profiles')
      .select('id, push_subscription')
      .eq('who', recipientWho)
      .maybeSingle();

    if (!recipient?.push_subscription) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_subscription' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let title = `${senderName} seni düşündü`;
    let subtitle =
      body.kind === 'photo'
        ? body.once
          ? 'Tek seferlik bir fotoğraf gönderdi'
          : 'Sana bir fotoğraf gönderdi'
        : body.kind === 'voice'
          ? 'Sana sesli bir yıldız bıraktı'
          : 'Gökyüzüne yeni bir yıldız düştü';

    // Zamanlı yıldızda içerik bildirimde asla yer almaz, yalnızca kilit bilgisi gönderilir
    if (body.unlockAt) {
      title = `${senderName} sana kilitli bir yıldız bıraktı`;
      subtitle = formatUnlockLabel(body.unlockAt);
    }

    const res = await sendToProfile(admin, recipient, {
      title,
      body: subtitle,
      url: '/',
    });

    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

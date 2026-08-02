/**
 * Rate-limiting pre autentifikačné endpointy (Users & Permissions).
 *
 * Chráni pred brute-force a zneužitím prihlásenia/registrácie/resetu hesla.
 * Ľahký in-memory limiter (bez externej závislosti) — vhodný pre jednouzlové
 * nasadenie (Hetzner). Počítadlo sa resetuje pri reštarte, čo je pri základnej
 * ochrane prijateľné.
 *
 * POZOR (produkcia): aby `ctx.request.ip` bola skutočná IP klienta a nie proxy,
 * treba v config/server.ts zapnúť `proxy: true` (za reverse-proxy/LB).
 */
type Bucket = { max: number; windowMs: number };

// Limity per skupina auth-ciest (počet POST pokusov / okno).
const RULES: Array<{ test: RegExp; bucket: Bucket }> = [
  { test: /\/api\/auth\/forgot-password$/, bucket: { max: 5, windowMs: 15 * 60_000 } },
  // „Zabudli ste heslo?" v admine — posiela e-mail, takže prísnejší strop.
  { test: /\/api\/account\/forgot-password$/, bucket: { max: 5, windowMs: 15 * 60_000 } },
  { test: /\/api\/auth\/reset-password$/, bucket: { max: 10, windowMs: 15 * 60_000 } },
  { test: /\/api\/auth\/local\/register$/, bucket: { max: 10, windowMs: 60 * 60_000 } },
  { test: /\/api\/auth\/(local|email-confirmation|send-email-confirmation)$/, bucket: { max: 15, windowMs: 15 * 60_000 } },
];

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Občasné čistenie expirovaných záznamov, nech Map nerastie donekonečna.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, e] of store) if (e.resetAt <= now) store.delete(k);
}

export default (_config: unknown, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    // Limituj len POST na auth cesty.
    if (ctx.method !== 'POST') return next();
    const path: string = ctx.request.path || ctx.path || '';
    const rule = RULES.find((r) => r.test.test(path));
    if (!rule) return next();

    const now = Date.now();
    sweep(now);
    const ip = ctx.request.ip || ctx.ip || 'unknown';
    const key = `${ip}|${path}`;
    let e = store.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + rule.bucket.windowMs };
      store.set(key, e);
    }
    e.count += 1;

    const remaining = Math.max(0, rule.bucket.max - e.count);
    ctx.set('X-RateLimit-Limit', String(rule.bucket.max));
    ctx.set('X-RateLimit-Remaining', String(remaining));

    if (e.count > rule.bucket.max) {
      const retryAfter = Math.ceil((e.resetAt - now) / 1000);
      ctx.set('Retry-After', String(retryAfter));
      strapi?.log?.warn?.(`[authRateLimit] blokované ${ip} na ${path} (prekročený limit ${rule.bucket.max})`);
      // Do hlášky patrí aj čas — bez neho človek háda, či je chyba v hesle
      // alebo v limite, a skúša dokola (čím si okno len predlžuje).
      const wait = retryAfter >= 60
        ? `${Math.ceil(retryAfter / 60)} min`
        : `${retryAfter} s`;
      ctx.status = 429;
      ctx.body = {
        error: {
          status: 429,
          name: 'TooManyRequests',
          message: `Priveľa pokusov. Skúste to znova o ${wait}.`,
        },
      };
      return;
    }
    return next();
  };
};

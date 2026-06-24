// Comma-separated origins z env: CORS_ORIGINS=https://app.vercel.app,https://abc.ngrok-free.app
// Plus default patterns (regex) pre Vercel preview deploys + ngrok/cloudflared tunely.
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedPatterns: RegExp[] = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https:\/\/.*\.vercel\.app$/,
  /^https:\/\/.*\.ngrok-free\.app$/,
  /^https:\/\/.*\.ngrok-free\.dev$/, // ngrok 3.20+ default suffix
  /^https:\/\/.*\.ngrok\.io$/,
  /^https:\/\/.*\.ngrok\.app$/,
  /^https:\/\/.*\.ngrok\.dev$/,
  /^https:\/\/.*\.trycloudflare\.com$/,
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (envOrigins.includes(origin)) return true;
  return allowedPatterns.some((re) => re.test(origin));
}

export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      // koa-cors origin: function(ctx) → string|null. Vracia echo origin ak je allowed.
      origin: (ctx: any) => {
        const origin = ctx.request.header.origin;
        return isAllowedOrigin(origin) ? origin : '';
      },
      credentials: true,
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

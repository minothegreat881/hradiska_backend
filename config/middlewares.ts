// Comma-separated origins z env: CORS_ORIGINS=https://app.vercel.app,https://abc.ngrok-free.app
// Plus default patterns (regex) pre Vercel preview deploys + ngrok/cloudflared tunely.
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const defaultPatterns: RegExp[] = [
  /^http:\/\/localhost:\d+$/, // dev: Vite na ľubovoľnom porte
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^https:\/\/.*\.vercel\.app$/, // Vercel preview + prod
  /^https:\/\/.*\.ngrok-free\.app$/,
  /^https:\/\/.*\.ngrok-free\.dev$/, // ngrok 3.20+ default doménový suffix
  /^https:\/\/.*\.ngrok\.io$/,
  /^https:\/\/.*\.ngrok\.app$/,
  /^https:\/\/.*\.ngrok\.dev$/,
  /^https:\/\/.*\.trycloudflare\.com$/,
];

const allowedOrigins = [...envOrigins, ...defaultPatterns];

export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: allowedOrigins,
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

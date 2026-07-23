import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const strip = (o) => Array.isArray(o) ? o.map(strip) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, strip(v)])) : o);
const RX = /1050 n\. l[…\.]+ Vedúci/u; const TO = '1050 n. l. Vedúci';
const r = await (await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-k-vikingom-2013-1-cast&populate[blocks][populate]=*&fields[0]=documentId`)).json();
const d = r.data[0]; let hit = 0;
const blocks = d.blocks.map((b) => {
  if (b.__component === 'content.rich-text') { const body = strip(b.body || []); const w = (n) => { if (typeof n.text === 'string') { const s2 = n.text.replace(RX, TO); if (s2 !== n.text) { n.text = s2; hit++; } } (n.children || []).forEach(w); }; body.forEach(w); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  return strip(b);
});
console.log('zasahov:', hit);
if (hit) { const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks } }) }); console.log(put.ok ? 'PUT OK' : 'FAIL ' + put.status); }
const v = await (await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-k-vikingom-2013-1-cast&populate[blocks][populate]=*`)).json();
let all = ''; for (const b of v.data[0].blocks || []) if (b.__component === 'content.rich-text') all += (b.body || []).map(n => (n.children || []).map(c => c.text || '').join('')).join(' ');
console.log('OK:', all.includes('800 – 1050 n. l. Vedúci'), '| okolo:', JSON.stringify(all.slice(all.indexOf('800'), all.indexOf('800') + 25)));

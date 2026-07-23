import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const strip = (o) => Array.isArray(o) ? o.map(strip) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, strip(v)])) : o);
const LEAD = /^[….]+\s*/; // začiatočné „…" / „..."

const r = await (await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-k-vikingom-2013-2-cast&populate[blocks][populate]=*&fields[0]=documentId`)).json();
const d = r.data[0];
let hit = 0;
const blocks = d.blocks.map((b) => {
  if (b.__component === 'content.rich-text') {
    const body = strip(b.body || []);
    for (const n of body) {
      if (n.type !== 'paragraph' || !n.children?.[0]) continue;
      const c = n.children[0];
      if (typeof c.text === 'string' && LEAD.test(c.text) && c.text.includes('Hamar je') && c.text.includes('významné miesto')) {
        c.text = 'Potešilo ma, ' + c.text.replace(LEAD, ''); hit++;
      }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  return strip(b);
});
console.log('zasahov:', hit);
if (hit) {
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks } }) });
  console.log(put.ok ? 'PUT OK' : 'FAIL ' + put.status);
}
const v = await (await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-k-vikingom-2013-2-cast&populate[blocks][populate]=*`)).json();
let full = '';
for (const b of v.data[0].blocks || []) if (b.__component === 'content.rich-text') full += (b.body || []).map(n => (n.children || []).map(c => c.text || '').join('')).join(' ');
const i = full.indexOf('Hamar je');
console.log('výsledok:', JSON.stringify(full.slice(i - 20, i + 40)));

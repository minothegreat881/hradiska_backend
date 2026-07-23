/**
 * Opravy prednaska-o-keltoch-video (telo + perex + alt).
 * Zlúčenie samostatného odkazu „TOMTO ODKAZE" do vety, názvy do úvodzoviek, Dwarf Digital.
 *   node _fix-keltoch-video.mjs [--commit]
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const COMMIT = process.argv.includes('--commit');
const nfc = (s) => (s == null ? s : String(s).normalize('NFC'));
const LQ = '„', RQ = '“', EN = '–';

const REPL = [
  ['Dwarf digital archeology', 'Dwarf Digital Archeology'],                                            // #1
  ['na tému Kelti na juhozápadnom Slovensku.', 'na tému ' + LQ + 'Kelti na juhozápadnom Slovensku' + RQ + '.'], // #2
  ['výstavu s názvom Podivuhodný keltský ľud, ktorú', 'výstavu s názvom ' + LQ + 'Podivuhodný keltský ľud' + RQ + ', ktorú'], // #4
  ['osady od Dwarf digital vo veľkom', 'osady od Dwarf Digital vo veľkom'],                             // #5
  ['Prednáška o Keltoch - Video', 'Prednáška o Keltoch ' + EN + ' Video'],                              // #6 alt
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const paraText = (b) => nfc((b.body || []).map(n => (n.children || []).map(c => c.text || (c.type === 'link' ? (c.children || []).map(x => x.text).join('') : '')).join('')).join('')).trim();
const isOdkazBlock = (b) => b.__component === 'content.rich-text' && (b.body || []).length === 1 && (b.body[0].children || []).length === 1 && b.body[0].children[0].type === 'link' && /TOMTO ODKAZE/i.test((b.body[0].children[0].children || []).map(x => x.text).join(''));

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=prednaska-o-keltoch-video&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const src = d.blocks || [];
  const out = [];
  let merged = false;
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    if (b.__component === 'content.rich-text') {
      const body = JSON.parse(JSON.stringify(b.body || []));
      body.forEach(walk);
      // #3: ak veta končí „zo záznamu na" a ďalší blok je samostatný odkaz TOMTO ODKAZE → zlúč
      const last = body[body.length - 1];
      if (paraText(b).endsWith('zo záznamu na') && src[i + 1] && isOdkazBlock(src[i + 1]) && last?.type === 'paragraph') {
        const link = JSON.parse(JSON.stringify(src[i + 1].body[0].children[0]));
        link.children = [{ type: 'text', text: 'tomto odkaze' }];
        last.children.push({ type: 'text', text: ' ' }, { type: 'link', url: link.url, children: link.children }, { type: 'text', text: '.' });
        merged = true;
        i++; // preskoč samostatný odkazový blok
      }
      out.push({ __component: 'content.rich-text', body });
    } else if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; if (typeof rest.alt === 'string') rest.alt = ap(rest.alt); if (typeof rest.caption === 'string') rest.caption = ap(rest.caption); out.push({ __component: 'content.image-block', ...rest, image: image?.id ?? image }); }
    else { const { id, ...rest } = b; out.push(rest); }
  }
  const newExcerpt = ap(d.excerpt || '');

  console.log('aplikovaných REPL:', applied.size, '/', REPL.length, '| odkaz zlúčený:', merged, '| blokov:', out.length, '(bolo', src.length + ')');
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 60)));

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: out } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

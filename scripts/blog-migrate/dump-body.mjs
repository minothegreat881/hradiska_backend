/**
 * Vypíše korektúrne-relevantný text jedného intermediate.json (title, excerpt,
 * rich-text bloky, citations, location) pre grammar-sk agenta. Read-only.
 * Použitie: node scripts/blog-migrate/dump-body.mjs <slug> [<slug2> …]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

for (const slug of process.argv.slice(2)) {
  const p = resolve(__dirname, 'out', `${slug}.intermediate.json`);
  let j; try { j = JSON.parse(readFileSync(p, 'utf8')); } catch { console.log(`\n### ${slug} — CHÝBA intermediate`); continue; }
  const bp = j.blogPost;
  console.log(`\n══════════ ${slug} ══════════`);
  console.log('TITLE:', bp.title);
  console.log('EXCERPT:', bp.excerpt);
  console.log('LOCATION:', JSON.stringify(bp.location));
  console.log('CITATIONS:', (bp.citations || []).map((c) => c.type + ':' + (c.text || c.title || c.url || '').slice(0, 60)).join(' | ') || '—');
  let n = 0;
  for (const b of bp.blocks || []) {
    if (b.__component === 'content.rich-text') {
      n++;
      const txt = (b.body || []).map((node) => {
        const t = (node.children || []).map((c) => c.text || '').join('');
        return node.type === 'heading' ? `## ${t}` : t;
      }).join('\n');
      console.log(`\n[rt#${n}] ${txt}`);
    } else if (b.__component === 'content.image-block') {
      console.log(`  [img: ${b.caption || '—'}]`);
    } else if (b.__component === 'content.quote-block') {
      console.log(`  [quote: ${((b.quote || b.text || '').slice(0, 80))}]`);
    }
  }
}

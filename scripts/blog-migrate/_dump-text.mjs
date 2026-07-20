// Vypíše text príspevku(ov) pre gramatickú kontrolu. Arg = fileBase (bez .intermediate.json).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const base of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(resolve(__dirname, 'out', `${base}.intermediate.json`), 'utf8')).blogPost;
  console.log('\n======== ' + base + ' ========');
  console.log('SLUG:', j.slug, '| TITLE:', JSON.stringify(j.title));
  console.log('EXCERPT:', JSON.stringify(j.excerpt));
  (j.blocks || []).forEach((b, i) => {
    if (b.__component === 'content.rich-text') {
      const txt = (b.body || []).map(n => {
        const t = (n.children || []).map(c => c.text || '').join('');
        return (n.type === 'heading' ? `  [H${n.level}] ` : '') + t;
      }).join('\n');
      console.log(`[${i}] rich-text:\n${txt}`);
    } else if (b.__component === 'content.image-block') {
      console.log(`[${i}] image-block caption=${JSON.stringify(b.caption || null)}`);
    } else if (b.__component === 'content.embed') {
      console.log(`[${i}] embed ${b.provider || ''} ${b.url || b.embedUrl || ''}`);
    } else {
      console.log(`[${i}] ${b.__component}`);
    }
  });
  const caps = (j.gallery || []).map(g => g.caption).filter(Boolean);
  if (caps.length) console.log('GALLERY CAPTIONS:', JSON.stringify(caps, null, 0));
}

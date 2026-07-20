// Pomôcka: vypíše text-uzly rich-text blokov daného intermediate (fileBase) pre §21 analýzu.
// usage: node _dump-blocks.mjs <fileBase>
import { readFileSync } from 'node:fs';
const fb = process.argv[2];
const j = JSON.parse(readFileSync(`out/${fb}.intermediate.json`, 'utf8'));
for (const [i, b] of (j.blogPost.blocks || []).entries()) {
  if (b.__component !== 'content.rich-text') { console.log(`=== blok ${i} (${b.__component}) ===`); continue; }
  console.log(`=== blok ${i} (rich-text) ===`);
  for (const [k, n] of (b.body || []).entries()) {
    for (const [ci, c] of (n.children || []).entries()) {
      const t = c.text !== undefined ? c.text : `[link ${c.url} -> ${(c.children || []).map((x) => x.text).join('')}]`;
      const tag = `${c.bold ? ' B' : ''}${c.italic ? ' I' : ''}`;
      console.log(`b${i}.n${k}.c${ci}${tag} [${n.type}${n.level ? ' h' + n.level : ''}]: ${JSON.stringify(t)}`);
    }
  }
}

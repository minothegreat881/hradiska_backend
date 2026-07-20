import fs from 'fs';

const slug = process.argv[2];
if (!slug) {
  console.error('usage: node apply-grammar.mjs <slug>');
  process.exit(1);
}

const interPath = `out/${slug}.intermediate.json`;
const grammarPath = `out/${slug}.grammar.json`;

const inter = JSON.parse(fs.readFileSync(interPath, 'utf8'));
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));

let applied = 0;
let failed = 0;

function findInBlock(block, before) {
  const matches = [];
  function walk(node) {
    if (node.text !== undefined) {
      const count = node.text.split(before).length - 1;
      if (count > 0) matches.push({ node, count });
    }
    if (node.children) node.children.forEach(walk);
  }
  (block.body || []).forEach(walk);
  return matches;
}

for (const c of grammar.corrections) {
  // Plošná oprava systematického preklepu (napr. najdete→nájdete) naprieč
  // všetkými rich-text blokmi — nevyžaduje jednoznačnosť. Použiť len pre
  // bezpečné, jednoznačné náhrady (dĺžne, mäkčene), nie pre kontextové zmeny.
  if (c.all) {
    let n = 0;
    for (const b of inter.blogPost.blocks) {
      if (b.__component !== 'content.rich-text') continue;
      const walk = (node) => {
        if (node.text !== undefined && node.text.includes(c.before)) {
          node.text = node.text.split(c.before).join(c.after);
          n += 1;
        }
        if (node.children) node.children.forEach(walk);
      };
      (b.body || []).forEach(walk);
    }
    if (n === 0) { console.error(`FAIL [all]: not found — "${c.before}"`); failed++; }
    else { applied++; console.log(`OK   [all ×${n}]: "${c.before}" -> "${c.after}"`); }
    continue;
  }

  let block = inter.blogPost.blocks[c.hint];
  let matches = block && block.__component === 'content.rich-text' ? findInBlock(block, c.before) : [];
  let totalCount = matches.reduce((s, m) => s + m.count, 0);
  let usedFallback = false;

  // Fallback: re-extraction (e.g. image-link fix) can shift block indices —
  // if the hinted block no longer has a unique match, search the whole
  // article. "before" strings are normally unique across the article anyway.
  if (totalCount !== 1) {
    const allBlockMatches = [];
    inter.blogPost.blocks.forEach((b, i) => {
      if (b.__component !== 'content.rich-text') return;
      const m = findInBlock(b, c.before);
      const cnt = m.reduce((s, x) => s + x.count, 0);
      if (cnt > 0) allBlockMatches.push({ idx: i, matches: m, count: cnt });
    });
    const totalAcrossDoc = allBlockMatches.reduce((s, b) => s + b.count, 0);
    if (totalAcrossDoc === 1) {
      block = inter.blogPost.blocks[allBlockMatches[0].idx];
      matches = allBlockMatches[0].matches;
      totalCount = 1;
      usedFallback = true;
    } else {
      totalCount = totalAcrossDoc;
    }
  }

  if (totalCount === 0) {
    console.error(`FAIL [block ${c.hint}]: not found — "${c.before}"`);
    failed++;
    continue;
  }
  if (totalCount > 1) {
    console.error(`FAIL [block ${c.hint}]: not unique (${totalCount}x) — "${c.before}"`);
    failed++;
    continue;
  }

  matches[0].node.text = matches[0].node.text.replace(c.before, c.after);
  applied++;
  console.log(`OK   [block ${c.hint}${usedFallback ? '->fallback' : ''}]: "${c.before}" -> "${c.after}"`);
}

fs.writeFileSync(interPath, JSON.stringify(inter, null, 2));
console.log(`\n${slug}: applied ${applied}/${grammar.corrections.length}, failed ${failed}`);
if (failed > 0) process.exit(1);

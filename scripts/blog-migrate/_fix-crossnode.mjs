import fs from 'fs';

const slugs = JSON.parse(fs.readFileSync('out/_batch28-slugs.json', 'utf8'));

for (const { slug } of slugs) {
  const interPath = `out/${slug}.intermediate.json`;
  const grammarPath = `out/${slug}.grammar.json`;
  const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
  const pending = grammar.skippedCrossNode || [];
  if (!pending.length) continue;

  const inter = JSON.parse(fs.readFileSync(interPath, 'utf8'));
  const stillMissing = [];
  const newlyApplied = [];

  for (const corr of pending) {
    let done = false;
    for (const block of inter.blogPost.blocks) {
      if (block.__component !== 'content.rich-text') continue;
      for (const node of block.body) {
        if (!Array.isArray(node.children)) continue;
        const concatenated = node.children.map((c) => c.text || '').join('');
        if (concatenated.includes(corr.before)) {
          // Merge all text children of this node into the first, apply replace, drop the rest.
          const merged = concatenated.replace(corr.before, corr.after);
          const firstTextChildIdx = node.children.findIndex((c) => typeof c.text === 'string');
          if (firstTextChildIdx === -1) continue;
          node.children[firstTextChildIdx].text = merged;
          node.children = node.children.filter((c, i) => i === firstTextChildIdx || typeof c.text !== 'string');
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (done) newlyApplied.push(corr);
    else stillMissing.push(corr);
  }

  fs.writeFileSync(interPath, JSON.stringify(inter, null, 2));
  fs.writeFileSync(
    grammarPath,
    JSON.stringify(
      {
        _note: `${(grammar.applied || []).length + newlyApplied.length} opráv aplikovaných celkovo, ${stillMissing.length} stále nenájdených`,
        applied: [...(grammar.applied || []), ...newlyApplied],
        skippedNotFound: [...(grammar.skippedNotFound || []), ...stillMissing],
      },
      null,
      2
    )
  );
  console.log(slug, 'newlyApplied:', newlyApplied.length, 'stillMissing:', stillMissing.length);
}

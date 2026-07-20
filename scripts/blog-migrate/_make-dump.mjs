import fs from 'fs';

const slugs = process.argv.slice(2);

function extractText(node) {
  if (node.type === 'text') return node.text || '';
  if (Array.isArray(node.children)) return node.children.map(extractText).join('');
  return '';
}

for (const slug of slugs) {
  const f = `out/${slug}.intermediate.json`;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const blocks = j.blogPost.blocks;
  const lines = [];
  blocks.forEach((b, i) => {
    if (b.__component === 'content.rich-text') {
      b.body.forEach((node) => {
        const text = extractText(node);
        if (!text.trim()) return;
        const prefix = node.type === 'heading' ? '##'.repeat(1) + ' ' : '';
        lines.push(`[${i}] ${prefix}${text}`);
      });
    } else if (b.__component === 'content.sources') {
      (b.items || []).forEach((item, k) => {
        lines.push(`[${i}.${k}] SOURCE: ${item.text || item.url || JSON.stringify(item)}`);
      });
    } else if (b.__component === 'content.image-block') {
      lines.push(`[${i}] IMAGE: ${b.caption || '(no caption)'}`);
    }
  });
  fs.writeFileSync(`out/_${slug}-dump.txt`, lines.join('\n'));
  console.log(slug, '=>', lines.length, 'lines');
}

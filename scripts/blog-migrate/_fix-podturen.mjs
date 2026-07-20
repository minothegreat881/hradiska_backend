import fs from 'fs';

const f = 'out/podturen-basta-velinok-varta.intermediate.json';
const inter = JSON.parse(fs.readFileSync(f, 'utf8'));
const blocks = inter.blogPost.blocks;
const srcIdx = blocks.findIndex((b) => b.__component === 'content.sources');
const src = blocks[srcIdx];

const bodyItemIdx = [1, 3, 4, 6, 8, 9, 11, 13, 15, 16, 17, 19, 20, 21, 22, 24, 25];

const newParagraphBlocks = bodyItemIdx.map((i) => ({
  __component: 'content.rich-text',
  body: [
    {
      type: 'paragraph',
      children: [{ type: 'text', text: src.items[i].text }],
    },
  ],
}));

// Remove moved items from sources (keep captions, byline, "Literatúra", and the real bibliography)
const keepIdx = new Set([0, 2, 5, 7, 10, 12, 14, 18, 23, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]);
src.items = src.items.filter((_, i) => keepIdx.has(i));

blocks.splice(srcIdx, 0, ...newParagraphBlocks);

fs.writeFileSync(f, JSON.stringify(inter, null, 2));
console.log('Inserted', newParagraphBlocks.length, 'paragraph blocks before sources block.');
console.log('Sources items remaining:', src.items.length);

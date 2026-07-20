import fs from 'fs';

const VALID_TYPES = new Set(['founding', 'battle', 'construction', 'destruction', 'discovery', 'event', 'era']);

function truncateYear(year) {
  if (typeof year !== 'string' || year.length <= 50) return year;
  const delimMatch = year.match(/^(.{1,50}?)(?: \(| – | - )/);
  if (delimMatch) return delimMatch[1].trim();
  return year.slice(0, 50).trim();
}

function normalizeTimeline(timeline) {
  return (timeline || []).map((t) => ({
    ...t,
    year: truncateYear(t.year),
    type: VALID_TYPES.has(t.type) ? t.type : 'event',
  }));
}

const slugsFile = process.argv[2] || 'out/_batch28-slugs.json';
const slugs = JSON.parse(fs.readFileSync(slugsFile, 'utf8'));

const summary = [];

for (const { key, slug } of slugs) {
  const interPath = `out/${slug}.intermediate.json`;
  const resultPath = `out/_agent-results/${key}.json`;
  const dumpPath = `out/_${slug}-dump.txt`;

  const inter = JSON.parse(fs.readFileSync(interPath, 'utf8'));
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const dump = fs.readFileSync(dumpPath, 'utf8');

  inter.blogPost.timeline = normalizeTimeline(result.timeline);
  inter.blogPost.keyFacts = result.keyFacts || [];

  const applied = [];
  const skippedNotFound = [];
  const skippedCrossNode = [];

  for (const corr of result.corrections || []) {
    const { before, after } = corr;
    if (!before || !dump.includes(before)) {
      skippedNotFound.push(corr);
      continue;
    }
    let appliedThis = false;
    for (const block of inter.blogPost.blocks) {
      if (block.__component !== 'content.rich-text') continue;
      for (const node of block.body) {
        if (!Array.isArray(node.children)) continue;
        for (const child of node.children) {
          if (typeof child.text === 'string' && child.text.includes(before)) {
            child.text = child.text.replace(before, after);
            appliedThis = true;
            break;
          }
        }
        if (appliedThis) break;
      }
      if (appliedThis) break;
    }
    if (appliedThis) {
      applied.push(corr);
    } else {
      skippedCrossNode.push(corr);
    }
  }

  fs.writeFileSync(interPath, JSON.stringify(inter, null, 2));

  fs.writeFileSync(
    `out/${slug}.timeline.json`,
    JSON.stringify({ _note: `Agent, overnight batch 28 (Strážna funkcia) 13.-14.7.2026`, timeline: inter.blogPost.timeline, keyFacts: inter.blogPost.keyFacts }, null, 2)
  );
  fs.writeFileSync(
    `out/${slug}.grammar.json`,
    JSON.stringify({ _note: `${applied.length} opráv aplikovaných, ${skippedCrossNode.length} cross-node preskočených, ${skippedNotFound.length} nenájdených v dumpe (možná halucinácia)`, applied, skippedCrossNode, skippedNotFound }, null, 2)
  );

  summary.push({
    slug,
    timelineCount: inter.blogPost.timeline.length,
    keyFactsCount: inter.blogPost.keyFacts.length,
    applied: applied.length,
    skippedCrossNode: skippedCrossNode.length,
    skippedNotFound: skippedNotFound.length,
  });
}

console.log(JSON.stringify(summary, null, 2));
const totalApplied = summary.reduce((s, r) => s + r.applied, 0);
const totalSkippedCross = summary.reduce((s, r) => s + r.skippedCrossNode, 0);
const totalSkippedNotFound = summary.reduce((s, r) => s + r.skippedNotFound, 0);
console.log(`\nTOTALS: applied=${totalApplied} skippedCrossNode=${totalSkippedCross} skippedNotFound=${totalSkippedNotFound}`);

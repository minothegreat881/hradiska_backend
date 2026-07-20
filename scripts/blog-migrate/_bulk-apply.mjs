import fs from 'fs';
const OUT='out';
// [fileBase, corrections[], titleBefore|null, titleAfter|null, note]
const BATCH = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2],'utf8')) : [];
function findInBlock(block, before){ const m=[]; const walk=n=>{ if(n.text!==undefined){ const c=n.text.split(before).length-1; if(c>0)m.push({node:n,count:c}); } if(n.children)n.children.forEach(walk); }; (block.body||[]).forEach(walk); return m; }
let totalOK=0, totalFail=0; const fails=[];
for(const item of BATCH){
  const {fb, corrections=[], titleBefore=null, titleAfter=null, note=''} = item;
  const interPath=`${OUT}/${fb}.intermediate.json`;
  const grPath=`${OUT}/${fb}.grammar.json`;
  if(!fs.existsSync(interPath)){ console.log(`${fb}: SKIP — intermediate missing`); fails.push(`${fb}: intermediate missing`); continue; }
  fs.writeFileSync(grPath, JSON.stringify({_note:note, corrections}, null, 2));
  const inter=JSON.parse(fs.readFileSync(interPath,'utf8'));
  let ok=0, fail=0;
  for(const c of corrections){
    let block=inter.blogPost.blocks[c.hint];
    let matches = block && block.__component==='content.rich-text' ? findInBlock(block,c.before) : [];
    let total = matches.reduce((s,m)=>s+m.count,0);
    if(total!==1){ // fallback whole doc
      const all=[]; inter.blogPost.blocks.forEach((b,i)=>{ if(b.__component!=='content.rich-text')return; const mm=findInBlock(b,c.before); const cnt=mm.reduce((s,x)=>s+x.count,0); if(cnt>0)all.push({i,mm,cnt}); });
      const t=all.reduce((s,b)=>s+b.cnt,0);
      if(t===1){ matches=all[0].mm; total=1; } else total=t;
    }
    if(total===1){ matches[0].node.text=matches[0].node.text.replace(c.before,c.after); ok++; }
    else { fail++; fails.push(`${fb} [${c.hint}] (${total}x): ${JSON.stringify(c.before)}`); }
  }
  // title patch
  let tp='';
  if(titleBefore && titleAfter){ if(inter.blogPost.title===titleBefore){ inter.blogPost.title=titleAfter; tp=' +title'; } else tp=` +title-SKIP(${JSON.stringify(inter.blogPost.title)})`; }
  fs.writeFileSync(interPath, JSON.stringify(inter,null,2));
  totalOK+=ok; totalFail+=fail;
  console.log(`${fb}: ${ok}/${corrections.length} ok, ${fail} fail${tp}`);
}
console.log(`\n=== BATCH: ${totalOK} applied, ${totalFail} failed ===`);
if(fails.length){ console.log('FAILS:'); fails.forEach(f=>console.log('  '+f)); }

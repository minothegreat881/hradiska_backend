#!/usr/bin/env node
/**
 * slovencina-v-en.mjs — nájde anglické verzie, ktoré majú slovenské telo.
 *
 * Takto sa poškodilo 11 článkov: zrkadlenie štruktúry doplnilo bloky bez
 * anglického párovníka slovenským textom a desaťminútový cron to publikoval.
 * Kontrola je jednoduchá a nezávislá od toho skriptu: v tele sa počítajú
 * slovenské funkčné slová, ktoré v anglickom texte nemajú čo robiť (vlastné
 * mená a názvy lokalít sa teda nehlásia).
 *
 * Číta verejné API, nič nemení.
 *
 *   node scripts/kontrola/slovencina-v-en.mjs            # len nálezy
 *   node scripts/kontrola/slovencina-v-en.mjs --vsetko   # aj počty pri čistých
 */

const API = 'http://188.245.47.29';
const VSETKO = process.argv.includes('--vsetko');
const HRANICA = 4;

/* Slovenské slová, ktoré nie sú ani anglické, ani vlastné mená. */
const SLOVA = ['sa', 'je', 'na', 'ktoré', 'ktorý', 'ktorá', 'bol', 'bola', 'boli', 'aby', 'pre',
  'ako', 'tiež', 'veľmi', 'preto', 'však', 'alebo', 'podľa', 'medzi', 'hradisko', 'hradiska',
  'bolo', 'tejto', 'tohto', 'svojho', 'nášho', 'iba', 'už', 'aj', 'teda', 'okrem'];
const VZORY = SLOVA.map((s) => new RegExp(`(^|[^\\p{L}])${s}([^\\p{L}]|$)`, 'giu'));

const textBloku = (b) => {
  const von = [];
  const prejdi = (n) => {
    if (Array.isArray(n)) return n.forEach(prejdi);
    if (!n || typeof n !== 'object') return;
    if (typeof n.text === 'string') von.push(n.text);
    for (const v of Object.values(n)) prejdi(v);
  };
  prejdi(b);
  return von.join(' ');
};

const text = (clanok) => {
  const von = [];
  const prejdi = (n) => {
    if (Array.isArray(n)) return n.forEach(prejdi);
    if (!n || typeof n !== 'object') return;
    if (typeof n.text === 'string') von.push(n.text);
    for (const v of Object.values(n)) prejdi(v);
  };
  prejdi(clanok.blocks || []);
  return von.join(' ');
};

async function strana(page) {
  const q = new URLSearchParams({
    locale: 'en', 'pagination[page]': String(page), 'pagination[pageSize]': '100',
    'fields[0]': 'slug', 'fields[1]': 'title', 'populate[blocks][populate]': '*',
  });
  const r = await fetch(`${API}/api/blog-posts?${q}`);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

let page = 1, celkom = 0, najdene = 0, spolu = 0;
for (;;) {
  const j = await strana(page);
  for (const c of j.data) {
    spolu++;
    const t = text(c);
    if (!t) continue;
    let n = 0;
    for (const v of VZORY) n += (t.match(v) || []).length;
    /* ktoré bloky sú slovenské — pri čiastočnom poškodení ide len o niektoré */
    const zle = [];
    (c.blocks || []).forEach((b, i) => {
      const tb = textBloku(b);
      if (tb.split(/\s+/).length < 12) return;
      let m = 0;
      for (const v of VZORY) m += (tb.match(v) || []).length;
      if (m / tb.split(/\s+/).length * 1000 > 20) zle.push([i + 1, b.__component.replace('content.', ''), m, tb.slice(0, 70)]);
    });
    const napis = n / Math.max(1, t.split(/\s+/).length) * 1000;   // na tisíc slov
    if (n > HRANICA) {
      najdene++;
      console.log(`!! ${c.slug}  (${n} slovenských slov, ${napis.toFixed(1)} na tisíc)`);
      console.log(`   „${c.title.slice(0, 70)}"`);
      for (const [i, typ, m, uk] of zle) console.log(`     blok ${i} ${typ} (${m}): ${uk}`);
    } else if (VSETKO) console.log(`   ${c.slug}: ${n}`);
  }
  celkom = j.meta.pagination.total;
  if (spolu >= celkom) break;
  page++;
}
console.log(`\nanglických článkov ${spolu} · so slovenským telom ${najdene}`);

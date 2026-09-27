/** Kontrola vysledku priamo v databaze: poradie a zaradenie. */
var Database = require('better-sqlite3');
var { zatried } = require('./pravidla.cjs');
var db = new Database(process.env.DB || '.tmp/data.db', { readonly: true });
var RUCNE = { 'spissky-stvrtok-slovenske-mykeny':1, 'belusske-slatiny-hradisko':1, 'zilina-zastranie-stranik':1 };
var bloky = db.prepare("select c.cmp_id blok, p.slug slug from blog_posts p join blog_posts_cmps c on c.entity_id=p.id where c.component_type='content.sources'").all();
var daj = db.prepare(`select i.text text, i.url url from components_content_sources_cmps l join components_shared_source_items i on i.id=l.cmp_id where l.entity_id=? and l.field='items' order by l."order" asc`);
var chyby = [], kontrolovane = 0, prazdnych = 0;
bloky.forEach(function (b) {
  var it = daj.all(b.blok);
  var texty = it.map(function (x) { return String(x.text || '').trim(); });
  if (RUCNE[b.slug] || texty.some(function (t) { return /^[0-9]+[.]? +\S/.test(t); })) return;
  kontrolovane++;
  var druhy = it.map(function (x) { return zatried(x).druh; });
  prazdnych += druhy.filter(function (d) { return d === 'prazdne'; }).length;
  // 1. odkazy musia byt az na konci
  var prvyOdkaz = druhy.indexOf('odkaz');
  if (prvyOdkaz >= 0 && druhy.slice(prvyOdkaz).some(function (d) { return d !== 'odkaz' && d !== 'poznamka'; }))
    chyby.push([b.slug, 'odkaz nie je na konci']);
  if (prvyOdkaz >= 0 && druhy.slice(prvyOdkaz).some(function (d) { return d === 'autor'; }))
    chyby.push([b.slug, 'autor az za odkazom']);
  // 2. autori musia byt na zaciatku a po abecede
  var klice = it.map(function (x) { return zatried(x); }).filter(function (z) { return z.druh === 'autor'; }).map(function (z) { return z.kluc; });
  for (var i = 1; i < klice.length; i++)
    if (String(klice[i-1]).localeCompare(String(klice[i]), 'sk') > 0) { chyby.push([b.slug, 'zle poradie: ' + klice[i-1] + ' pred ' + klice[i]]); break; }
  var poslednyAutor = druhy.lastIndexOf('autor');
  if (poslednyAutor >= 0 && druhy.slice(0, poslednyAutor).some(function (d) { return d !== 'autor'; }))
    chyby.push([b.slug, 'poznamka medzi autormi']);
});
console.log('kontrolovanych blokov:', kontrolovane, '| prazdnych poloziek:', prazdnych);
console.log('chyb:', chyby.length);
chyby.slice(0, 10).forEach(function (c) { console.log('  ', c[0], '-', c[1]); });

/**
 * ZORADENIE BIBLIOGRAFIE priamo v databaze.
 *
 * Preco nie cez API: PUT s polom `blocks` prepise CELU dynamicku zonu, takze
 * by sa musel poslat kazdy blok clanku znova - vratane obrazkov a bohateho
 * textu. Jedina vec, ktora sa tu meni, je text zaznamu a jeho poradie, a to
 * su dva stlpce: `text` v components_shared_source_items a `order` v linkovacej
 * tabulke. Nic ine sa necha na pokoji.
 *
 * Meni sa koncept AJ publikovana verzia - kazda ma vlastne riadky komponentov.
 *
 * Spustenie: node bib-zapis.cjs            (nasucho, nic nezapise)
 *            node bib-zapis.cjs --zapisat  (zapise)
 */
var Database = require('better-sqlite3');
var { zatried } = require('./pravidla.cjs');

var ZAPISAT = process.argv.indexOf('--zapisat') >= 0;
var db = new Database(process.env.DB || '.tmp/data.db');

var RUCNE_VYNECHAT = {
  'spissky-stvrtok-slovenske-mykeny': 1,
  'belusske-slatiny-hradisko': 1,
  'zilina-zastranie-stranik': 1
};

var bloky = db.prepare(
  "select c.cmp_id as blok, p.slug as slug, p.published_at is null as koncept " +
  "from blog_posts p join blog_posts_cmps c on c.entity_id = p.id " +
  "where c.component_type = 'content.sources'"
).all();

var dajPolozky = db.prepare(
  "select l.id as link_id, l.\"order\" as poradie, i.id as item_id, i.text as text, i.url as url " +
  "from components_content_sources_cmps l join components_shared_source_items i on i.id = l.cmp_id " +
  "where l.entity_id = ? and l.field = 'items' order by l.\"order\" asc"
);
var nastavText = db.prepare('update components_shared_source_items set text = ? where id = ?');
var nastavPoradie = db.prepare('update components_content_sources_cmps set "order" = ? where id = ?');
var zmazLink = db.prepare('delete from components_content_sources_cmps where id = ?');
var zmazPolozku = db.prepare('delete from components_shared_source_items where id = ?');

var stat = { blokov: bloky.length, preskocene: 0, upravene: 0, prepisanychTextov: 0, presunutych: 0, zmazanychPrazdnych: 0 };
var preskoceneSlugy = {};

function poradie(a, b) { return String(a).localeCompare(String(b), 'sk'); }

var praca = [];
for (var i = 0; i < bloky.length; i++) {
  var b = bloky[i];
  var polozky = dajPolozky.all(b.blok);
  var texty = polozky.map(function (x) { return String(x.text || '').trim(); });

  var cislovane = texty.some(function (t) { return /^[0-9]+[.]? +\S/.test(t); });
  if (RUCNE_VYNECHAT[b.slug] || cislovane) {
    stat.preskocene++; preskoceneSlugy[b.slug] = 1; continue;
  }

  var autori = [], poznamky = [], odkazy = [], prazdne = [];
  var zatriedene = polozky.map(function (x) { return zatried({ text: x.text, url: x.url }); });
  zatriedene.forEach(function (z, k) {
    var p = polozky[k];
    if (z.druh === 'prazdne') { prazdne.push(p); return; }
    if (z.druh === 'odkaz') {
      var pred = zatriedene[k - 1];
      if (pred && pred.druh === 'poznamka' && /:$/.test(pred.text) &&
          poznamky.length && poznamky[poznamky.length - 1].link_id === polozky[k - 1].link_id) {
        odkazy.push(poznamky.pop());
      }
      odkazy.push(p); return;
    }
    if (z.druh === 'poznamka') { poznamky.push(p); return; }
    p.novyText = z.novyText; p.kluc = z.kluc;
    autori.push(p);
  });

  autori.sort(function (x, y) {
    var r = poradie(x.kluc, y.kluc);
    return r !== 0 ? r : poradie(x.novyText, y.novyText);
  });

  var nove = autori.concat(poznamky, odkazy);
  praca.push({ blok: b, nove: nove, prazdne: prazdne, povodne: polozky });
}

db.transaction(function () {
  praca.forEach(function (u) {
    var zmena = false;
    u.nove.forEach(function (p, idx) {
      var noveP = idx + 1;
      if (p.novyText && p.novyText !== p.text) {
        stat.prepisanychTextov++; zmena = true;
        if (!ZAPISAT && process.env.VYPIS) { console.log('  - ' + p.text); console.log('  + ' + p.novyText); }
        if (ZAPISAT) nastavText.run(p.novyText, p.item_id);
      }
      if (p.poradie !== noveP) {
        stat.presunutych++; zmena = true;
        if (ZAPISAT) nastavPoradie.run(noveP, p.link_id);
      }
    });
    u.prazdne.forEach(function (p) {
      stat.zmazanychPrazdnych++; zmena = true;
      if (ZAPISAT) { zmazLink.run(p.link_id); zmazPolozku.run(p.item_id); }
    });
    if (zmena) stat.upravene++;
  });
})();

console.log(ZAPISAT ? 'ZAPISANE' : 'NASUCHO (nic sa nezapisalo)');
console.log(JSON.stringify(stat, null, 1));
console.log('preskocenych clankov:', Object.keys(preskoceneSlugy).length, Object.keys(preskoceneSlugy).join(', '));

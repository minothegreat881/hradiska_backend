var Database = require('better-sqlite3');
var { zatried } = require('./pravidla.cjs');
var db = new Database(process.env.DB || '.tmp/data.db', { readonly: true });
var slug = process.argv[2];
var b = db.prepare("select c.cmp_id blok from blog_posts p join blog_posts_cmps c on c.entity_id=p.id where c.component_type='content.sources' and p.slug=? limit 1").get(slug);
var it = db.prepare(`select l."order" ord, i.text text, i.url url from components_content_sources_cmps l join components_shared_source_items i on i.id=l.cmp_id where l.entity_id=? and l.field='items' order by l."order" asc`).all(b.blok);
it.forEach(function (x) {
  var z = zatried(x);
  console.log(String(x.ord).padStart(2), z.druh.padEnd(9), String(z.kluc || '').padEnd(16), String(x.text || '').slice(0, 70));
});

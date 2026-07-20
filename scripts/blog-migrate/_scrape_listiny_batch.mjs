import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const posts = [
  { slug: 'fuldske-analy-listina', postId: '5477913625559314219' },
  { slug: 'gaius-iulius-caesar-obliehanie-avarica', postId: '7077883068263171892' },
  { slug: 'kniha-vzacnych-drahocennosti', postId: '9150551119499323860' },
  { slug: 'madari-v-pisomnych-pramenoch', postId: '6336116012320609389' },
  { slug: 'najstarsi-recept-na-medovinu-14-stor', postId: '5611205483337944161' },
  { slug: 'pribinova-druzina', postId: '3590378540693473799' },
  { slug: 'prokopios-6-storocie', postId: '3787542738479484575' },
  { slug: 'slovanski-bohovia-v-pisomnych-pramenoch', postId: '2781947799429192474' },
  { slug: 'spis-o-obrateni-bavorov-a-korutancov', postId: '3327350620942091477' },
  { slug: 'starobyly-rastislavov-devin-871', postId: '1260034602369011223' },
  { slug: 'zakonnik-velkej-moravy-zakon-sudnyj-ljudem', postId: '5137902016726769872' },
  { slug: 'zazracny-dazd-zachranil-rimanov', postId: '1299958807111678833' },
  { slug: 'humno-najstarsia-zmienka', postId: '2972448229439288034' },
  { slug: 'falosne-runove-napisy-na-skalach', postId: '3572447761725566579' },
  { slug: 'anton-intibus-1855-o-okoli-trnavy', postId: '2559266234483803437' },
  { slug: 'konstantin-porfyrogenetes-a-jeho-moravy', postId: '127485922108517990' },
  { slug: 'kyjevske-listy', postId: '1889279452081158991' },
  { slug: 'cividalsky-evanjeliar-pribina-kocel', postId: '7493642342981370223' },
  { slug: 'moslimovia-o-madaroch-pred-zaujatim', postId: '232785066543504999' },
];

async function fetchEntry(postId) {
  const url = `http://www.hradiska.sk/feeds/posts/default/${postId}?alt=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${postId}`);
  const j = await res.json();
  return j.entry;
}

for (const { slug, postId } of posts) {
  try {
    const entry = await fetchEntry(postId);
    const wrapped = {
      feed: {
        title: { $t: 'hradiska.sk' },
        entry: [entry],
        openSearch$totalResults: { $t: '1' },
      },
    };
    const outPath = resolve(__dirname, `data/newsite-${slug}.json`);
    writeFileSync(outPath, JSON.stringify(wrapped, null, 2), 'utf8');
    console.log('OK', slug, '->', outPath);
  } catch (e) {
    console.error('FAIL', slug, e.message);
  }
}

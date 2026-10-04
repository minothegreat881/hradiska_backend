/**
 * Popisky fotografií v galérii Majcichova.
 *
 * Galéria berie popis z média, nie z bloku v tele — a tam ostali surové
 * tvary z Bloggeru („Zretelne viditelné…"). Pri troch fotografiách teda
 * dopĺňame opravený popis a pri štyroch znovu nahratých mažeme pomocné
 * „Majcichov", ktoré sa čitateľovi zobrazovalo ako popis.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = readFileSync(resolve(__dirname, '../../.env'), 'utf8').match(/^STRAPI_TOKEN=(.*)$/m)[1].trim();
const STRAPI = 'http://188.245.47.29';

const ZMENY = [
  { id: 1347, caption: 'Zreteľne viditeľné hradisko na mape 2. vojenského mapovania 1810 – 1869' },
  { id: 1348, caption: 'Najnovšie rekonštrukčné obrázky z dielne AÚ SAV' },
  { id: 6388, caption: 'Staršie rekonštrukcie hradby' },
  { id: 6396, caption: '', alt: '' },
  { id: 6397, caption: '', alt: '' },
  { id: 6398, caption: '', alt: '' },
  { id: 6399, caption: '', alt: '' },
];

for (const z of ZMENY) {
  const info = { caption: z.caption };
  if (z.alt !== undefined) info.alternativeText = z.alt;
  else if (z.caption) info.alternativeText = z.caption;
  const fd = new FormData();
  fd.append('fileInfo', JSON.stringify(info));
  const r = await fetch(`${STRAPI}/api/upload?id=${z.id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, Connection: 'close' }, body: fd,
    signal: AbortSignal.timeout(120000),
  });
  const t = await r.text();
  console.log(r.ok ? `  ok ${z.id}: ${z.caption || '(popis zmazaný)'}` : `  CHYBA ${z.id} → ${r.status}: ${t.slice(0, 200)}`);
}

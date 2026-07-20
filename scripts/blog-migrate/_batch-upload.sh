#!/bin/bash
for slug in arkona-retra-a-ine-pohanske-svatyne-zapadnych-slovanov bina bojna-vyznamne-velkomoravske-centrum bratislava chotebuz-podobora devin hradisko-nitrianska-blatnica-rotunda-blatnicky-durko hradisko-svaty-jur-nestich klucov nitra pobedim slovanske-hradiska-v-nemecku spisske-tomasovce visegrad-dalsie-velkomoravske-hradisko-v-madarsku-hu vysny-kubin-ostra-skala wogastisburg-najvyznamnejsie-hradisko-samovej-rise zvolen-motova-hradok-priekopa; do
  echo "=== $slug ==="
  node upload.mjs --input="out/${slug}.intermediate.json" --dry-run=false 2>&1 | tail -15
  echo ""
done
echo "BATCH DONE"

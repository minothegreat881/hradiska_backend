#!/bin/bash
for slug in bratislava chotebuz-podobora hradisko-nitrianska-blatnica-rotunda-blatnicky-durko hradisko-svaty-jur-nestich klucov nitra pobedim slovanske-hradiska-v-nemecku spisske-tomasovce visegrad-dalsie-velkomoravske-hradisko-v-madarsku-hu vysny-kubin-ostra-skala wogastisburg-najvyznamnejsie-hradisko-samovej-rise zvolen-motova-hradok-priekopa gars-thunau-velkomoravske-hradisko-v-rakusku novohrad-nograd-h stare-mesto-velehrad stary-tekov zemplin; do
  echo "=== $slug ==="
  node upload.mjs --input="out/${slug}.intermediate.json" --dry-run=false 2>&1 | tail -15
  echo ""
done
echo "BATCH2 DONE"

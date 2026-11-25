const fs = require('fs');
const path = require('path');

// Run from lib/vscode after the builtin extensions are unpacked, so the palette prefix follows the product name.
const EXTENSIONS = ['wso2.ballerina', 'wso2.wso2-integrator'];
// Includes both flavors' names: the Linux extension cache is shared between them.
const PRODUCT_CATEGORIES = new Set(['Choreo Integrator', 'Choreo Agent Builder', 'WSO2 Integrator']);

const productName = JSON.parse(fs.readFileSync('product.json', 'utf8')).nameShort;
if (!productName) {
  throw new Error('product.json has no nameShort; run ci/build/update-product.sh first');
}

for (const id of EXTENSIONS) {
  const file = path.join('.build', 'builtInExtensions', id, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  for (const command of manifest.contributes?.commands ?? []) {
    if (PRODUCT_CATEGORIES.has(command.category) && command.category !== productName) {
      command.category = productName;
      changed++;
    }
  }
  if (changed > 0) {
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(`${id}: ${changed} command categories set to "${productName}"`);
}

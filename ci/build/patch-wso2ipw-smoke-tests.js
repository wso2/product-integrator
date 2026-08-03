const fs = require('fs');
const path = require('path');

// The example comes from the caller rather than a list in here: the workflow's `example` matrix is the
// single source of truth for which ones exist. Hardcoding them here would let a new matrix entry go
// unpatched — the checks below only fire for names this script is told about, so that example would
// drive the old welcome page and fail in the UI instead of here.
const [, , examplesRoot, example] = process.argv;
if (!examplesRoot || !example) {
  throw new Error('Usage: node patch-wso2ipw-smoke-tests.js <wso2ipw-examples-directory> <example>');
}

const oldHeading = 'Create New Integration';
const currentHeading = 'Start your Integration Project';
const requiredCreationFormSelectors = [
  "getByRole('button', {name: 'Create', exact: true})",
  'Integration Name',
  'Project Name',
  'Create Integration',
];

const script = path.join(examplesRoot, example, '02-create-integration.sh');
const source = fs.readFileSync(script, 'utf8');

if (!source.includes(oldHeading) && !source.includes(currentHeading)) {
  throw new Error(`${script} contains neither the old nor the current welcome-page heading`);
}

for (const selector of requiredCreationFormSelectors) {
  if (!source.includes(selector)) {
    throw new Error(`${script} is missing the expected creation-flow selector: ${selector}`);
  }
}

const updated = source.split(oldHeading).join(currentHeading);
fs.writeFileSync(script, updated);
console.log(`Aligned ${script} with the current welcome page`);

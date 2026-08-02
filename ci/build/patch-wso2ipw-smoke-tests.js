const fs = require('fs');
const path = require('path');

const examplesRoot = process.argv[2];
if (!examplesRoot) {
  throw new Error('Usage: node patch-wso2ipw-smoke-tests.js <wso2ipw-examples-directory>');
}

const oldHeading = 'Create New Integration';
const currentHeading = 'Start your Integration Project';
const requiredCreationFormSelectors = [
  "getByRole('button', {name: 'Create', exact: true})",
  'Integration Name',
  'Project Name',
  'Create Integration',
];

for (const example of ['hello-world-service', 'icp']) {
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
}

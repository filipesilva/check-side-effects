import { execSync } from 'child_process';

execSync('npm install --no-save @angular/core@7.2.1', { stdio: 'ignore' });
const got = execSync('node dist/cli.js ./node_modules/@angular/core/esm5/core.js').toString();
const expected = `import "tslib";

import "rxjs";

import "rxjs/operators";

`

if (got != expected) {
  console.error('Test Failed');
  console.error('Expected:');
  console.error('---');
  console.error(JSON.stringify(expected));
  console.error('---');
  console.error('Got:');
  console.error('---');
  console.error(JSON.stringify(got));
  console.error('---');
  process.exit(1)
} else {
  console.log('Test Passed');
}
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

copyFileSync(resolve(root, 'host.json'), resolve(dist, 'host.json'));

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const slim = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  main: 'src/index.js',
  dependencies: pkg.dependencies,
};
writeFileSync(resolve(dist, 'package.json'), JSON.stringify(slim, null, 2));

execSync('npm install --omit=dev --no-audit --no-fund --ignore-scripts', {
  cwd: dist,
  stdio: 'inherit',
});

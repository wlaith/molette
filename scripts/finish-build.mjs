// Runs after vite + tsc. Plain Node so the build works on every OS (no `cp`).
// 1. Copies the stylesheet into dist.
// 2. Writes a .d.cts twin of every .d.ts, with './x.js' imports pointing at './x.cjs',
//    so TypeScript projects that `require('molette')` get CommonJS types instead of ESM ones.
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
copyFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), join(dist, 'styles.css'));

for (const file of readdirSync(dist, { recursive: true, encoding: 'utf8' })) {
  if (!file.endsWith('.d.ts')) continue;
  const src = readFileSync(join(dist, file), 'utf8');
  const cts = src.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.js(['"])/g, '$1.cjs$2');
  writeFileSync(join(dist, file.replace(/\.d\.ts$/, '.d.cts')), cts);
}

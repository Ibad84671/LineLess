// Packages the Lambda artifact: backend/src flattened to the zip root plus
// production node_modules and a package.json marked ESM.
// Usage: node scripts/package-backend.js [--out dist/lambda.zip]

import { createWriteStream, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, cpSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import path from 'node:path';
import archiver from 'archiver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'dist/lambda.zip';
const outPath = path.resolve(root, outArg);
const stagePath = path.resolve(root, 'dist', 'lambda-stage');

if (!existsSync(path.join(root, 'node_modules'))) {
  console.error('node_modules missing — run `npm install` first.');
  process.exit(1);
}

// Stage: flatten backend/src/* to root (handlers resolve ./shared/... etc.)
rmSync(stagePath, { recursive: true, force: true });
mkdirSync(stagePath, { recursive: true });
cpSync(path.join(root, 'backend', 'src'), stagePath, { recursive: true });

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
writeFileSync(
  path.join(stagePath, 'package.json'),
  JSON.stringify({ name: 'lineless-lambda', type: 'module', dependencies: pkg.dependencies }, null, 2),
);

// Production dependencies only.
console.log('Installing production dependencies…');
execSync(`npm install --omit=dev --no-audit --no-fund --prefix "${stagePath}"`);

mkdirSync(path.dirname(outPath), { recursive: true });
rmSync(outPath, { force: true });

await new Promise((resolve, reject) => {
  const zip = archiver('zip', { zlib: { level: 9 } });
  const output = createWriteStream(outPath);
  output.on('close', resolve);
  zip.on('error', reject);
  zip.pipe(output);
  zip.directory(stagePath, false);
  zip.finalize();
});

const { size } = statSync(outPath);
console.log(`Lambda artifact: ${outPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);

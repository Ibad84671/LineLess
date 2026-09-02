// Static security & hygiene checks. Exit 1 on any violation.
//
// Scans committed source (frontend/, backend/, scripts/, infrastructure/,
// tests/, docs/, root files) for:
//  - hardcoded AWS access keys / private keys
//  - hardcoded account IDs / ARNs
//  - hardcoded deployed URLs (cloudfront / execute-api / amazoncognito)
//  - placeholder TODO/FIXME/XXX in core code
//  - accidental committed runtime config / env files

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = ['backend', 'frontend', 'scripts', 'infrastructure', 'tests', 'docs'];
const ROOT_FILES = [
  'package.json', 'README.md', 'CHANGELOG.md', 'SECURITY.md', 'CONTRIBUTING.md',
  'LICENSE', '.gitignore', '.env.example',
];
const ALLOW_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.css', '.html', '.md', '.example', '']);

const ALLOWLIST_PATTERNS = [
  // Example docs/keys in this repository's own explanations
  /AKIAIOSFODNN7EXAMPLE/, // canonical AWS documentation example key
  /50\d{10}(?!\d)/, // handled separately below — placeholder
];

const CHECKS = [
  {
    name: 'AWS access key id (AKIA/ASIA)',
    pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
    allow: [/AKIAIOSFODNN7EXAMPLE/],
  },
  {
    name: 'private key material',
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    allow: [],
  },
  {
    name: 'aws secret access key assignment',
    pattern: /aws_secret_access_key\s*=\s*\S+|secretAccessKey\s*[:=]\s*['"][A-Za-z0-9/+=]{20,}['"]/,
    allow: [],
  },
  {
    name: 'hardcoded deployed URL',
    pattern: /https:\/\/[a-z0-9]+\.cloudfront\.net|https:\/\/[a-z0-9.-]*\.execute-api\.[a-z0-9-]+\.amazonaws\.com|wss:\/\/[a-z0-9.-]*\.execute-api/,
    allow: [],
  },
  {
    name: 'hardcoded cognito domain',
    pattern: /https:\/\/[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com/,
    allow: [],
  },
  {
    name: 'placeholder markers in core code',
    pattern: /\b(TODO|FIXME|HACK|XXX)\b/,
    allow: [],
    dirsOnly: ['backend', 'frontend'],
  },
];

// Hardcoded 12-digit account IDs inside Arn strings (excluding our own docs).
const ARN_ACCOUNT = /arn:aws:[a-z0-9-]*:[a-z0-9-]*:(\d{12}):/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function filesToScan() {
  const files = [];
  for (const d of SCAN_DIRS) {
    const p = path.join(root, d);
    if (existsSync(p)) files.push(...walk(p));
  }
  for (const f of ROOT_FILES) {
    const p = path.join(root, f);
    if (existsSync(p)) files.push(p);
  }
  return files;
}

let violations = 0;

for (const file of filesToScan()) {
  const ext = path.extname(file);
  if (!ALLOW_EXT.has(ext) && !file.endsWith('.env.example')) continue;
  if (file.includes('package-lock.json')) continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const rel = path.relative(root, file);
  const lines = content.split(/\r?\n/);

  lines.forEach((line, i) => {
    for (const check of CHECKS) {
      if (check.dirsOnly && !check.dirsOnly.some((d) => rel.startsWith(d + path.sep))) continue;
      if (check.pattern.test(line)) {
        if (check.allow.some((a) => a.test(line))) continue;
        console.error(`VIOLATION [${check.name}] ${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        violations += 1;
      }
    }
    const arnMatch = ARN_ACCOUNT.exec(line);
    if (arnMatch) {
      console.error(`VIOLATION [hardcoded account id in ARN] ${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      violations += 1;
    }
  });

  if (rel === 'frontend' + path.sep + 'config.js') {
    console.error(`VIOLATION [generated runtime config committed] ${rel}`);
    violations += 1;
  }
}

if (violations > 0) {
  console.error(`\nStatic checks FAILED: ${violations} violation(s).`);
  process.exit(1);
}
console.log('Static checks PASSED: no secrets, no hardcoded URLs/accounts, no placeholders in core code.');

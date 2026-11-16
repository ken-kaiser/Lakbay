// CI checks for the Lakbay static site. No dependencies; needs Node 22+.
// 1. Every JS file must parse (syntax check).
// 2. Every file the service worker precaches must exist (a missing file
//    makes the service worker install fail, which breaks offline mode).
// 3. Every local src/href in the HTML pages must point to a real file.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.github') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(root);

// 1. JS syntax
const jsFiles = files.filter((f) => f.endsWith('.js') && !f.includes(join('vendor', '')));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    errors.push(`Syntax error in ${relative(root, f)}:\n${e.stderr.toString()}`);
  }
}

// 2. Service worker precache list
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const precache = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!precache) {
  errors.push('Could not find the PRECACHE list in sw.js');
} else {
  for (const [, p] of precache[1].matchAll(/'([^']+)'/g)) {
    if (!existsSync(join(root, p))) errors.push(`sw.js precaches a missing file: ${p}`);
  }
}

// 3. Local links in HTML
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(url)) continue;
    const clean = url.split(/[?#]/)[0];
    if (!clean) continue;
    if (!existsSync(join(dirname(f), clean))) {
      errors.push(`${relative(root, f)} links to a missing file: ${url}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${jsFiles.length} JS files parsed, service worker and HTML links verified.`);

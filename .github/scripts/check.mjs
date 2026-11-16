// CI checks for the Lakbay static site. No dependencies; needs Node 22+.
// 1. Every JS file must parse (syntax check).
// 2. Every named import must exist as an export in the imported file
//    (a typo here breaks the whole page at load time).
// 3. Every file the service worker precaches must exist (a missing file
//    makes the service worker install fail, which breaks offline mode).
// 4. Every local src/href in the HTML pages must point to a real file.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
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

// 2. Named imports resolve to real exports
const exportCache = new Map();
function exportsOf(file) {
  if (exportCache.has(file)) return exportCache.get(file);
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop();
      if (n) names.add(n);
    }
  }
  exportCache.set(file, names);
  return names;
}
for (const f of jsFiles) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = resolve(dirname(f), m[2]);
    if (!existsSync(target)) { errors.push(`${relative(root, f)} imports a missing file: ${m[2]}`); continue; }
    const available = exportsOf(target);
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name && !available.has(name)) errors.push(`${relative(root, f)} imports '${name}', which ${m[2]} does not export`);
    }
  }
}

// 3. Service worker precache list
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const precache = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!precache) {
  errors.push('Could not find the PRECACHE list in sw.js');
} else {
  for (const [, p] of precache[1].matchAll(/'([^']+)'/g)) {
    if (!existsSync(join(root, p))) errors.push(`sw.js precaches a missing file: ${p}`);
  }
}

// 4. Local links in HTML
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
console.log(`OK: ${jsFiles.length} JS files parsed, imports resolved, service worker and HTML links verified.`);

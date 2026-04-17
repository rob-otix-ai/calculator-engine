/**
 * Post-build script: adds .js extensions to relative imports in dist/ so that
 * Node's native ESM loader can resolve them without --experimental-specifier-resolution.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;

// Match: from './foo' or from '../foo' (no extension)
const RE = /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else if (e.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = await walk(DIST);
let patched = 0;

for (const f of files) {
  const src = await readFile(f, 'utf8');
  const out = src.replace(RE, (match, pre, path, post) => {
    // Skip if already has an extension
    if (/\.\w+$/.test(path)) return match;
    patched++;
    return `${pre}${path}.js${post}`;
  });
  if (out !== src) await writeFile(f, out);
}

console.log(`fix-esm-extensions: patched ${patched} imports in ${files.length} files`);

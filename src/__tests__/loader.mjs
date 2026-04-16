// Tiny Node loader: rewrites extensionless ./relative imports to add .js
// so the bundler-targeted ESM output in dist/ runs under raw Node. Used only
// by smoke.test.mjs.

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !specifier.endsWith('.js') &&
    !specifier.endsWith('.mjs') &&
    !specifier.endsWith('.cjs') &&
    !specifier.endsWith('.json')
  ) {
    const parentURL = context.parentURL;
    if (parentURL) {
      const parentPath = fileURLToPath(parentURL);
      const candidate = resolvePath(dirname(parentPath), `${specifier}.js`);
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

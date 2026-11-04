// Sizes of the build (gzip), and the first screen's JavaScript against its
// budget of 60 KB gzip (D108): the entry chunk index.html loads.
// npm run build && npm run size
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'dist';
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
const rows = readdirSync(join(dist, 'assets'))
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => ({ name, raw: readFileSync(join(dist, 'assets', name)).length, gzip: gz(join(dist, 'assets', name)) }))
  .sort((a, b) => b.gzip - a.gzip);

for (const row of rows) console.log(`${row.name.padEnd(36)} ${kb(row.raw).padStart(10)} ${kb(row.gzip).padStart(10)} gzip`);
const first = gz(join(dist, 'index.html')) + (entry ? gz(join(dist, entry)) : 0);
console.log(`index.html (CSS inline)              ${kb(gz(join(dist, 'index.html'))).padStart(21)} gzip`);
console.log(`first screen: index.html + ${entry} = ${kb(first)} gzip (budget 60 KB)`);
if (first > 60 * 1024) process.exitCode = 1;

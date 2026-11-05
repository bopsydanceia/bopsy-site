// Fills the publisher's details into the built site (D140), from the
// repository variables of GitHub (Settings > Secrets and variables >
// Actions > Variables), so nothing personal has to be edited in the pages:
//   LEGAL_NAME         first and last name as registered (micro-entreprise)
//   LEGAL_ADDRESS      postal address (a domiciliation address works)
//   LEGAL_SIREN        SIREN number
//   SUPPORT_EMAIL      the support address
//   CONSUMER_MEDIATOR  name and website of the consumer mediator
// Usage: node scripts/fill-legal.mjs <site folder> [--strict]
// --strict (live build): fails when a blank is left in a page.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, flag] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node scripts/fill-legal.mjs <site folder> [--strict]');
  process.exit(2);
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const env = (name) => (process.env[name] ?? '').trim();
const values = {
  'COMPANY LEGAL NAME': env('LEGAL_NAME'),
  ADDRESS: env('LEGAL_ADDRESS'),
  SIREN: env('LEGAL_SIREN'),
  'SUPPORT EMAIL': env('SUPPORT_EMAIL'),
  'CONSUMER MEDIATOR': env('CONSUMER_MEDIATOR'),
};

function pages(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name === 'app') return []; // the web app has no blanks
    return statSync(path).isDirectory() ? pages(path) : name.endsWith('.html') ? [path] : [];
  });
}

const left = [];
for (const page of pages(dir)) {
  let html = readFileSync(page, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const safe = escape(value);
    html = html.split(`mailto:[${key}]`).join(`mailto:${encodeURIComponent(value).replace(/%40/g, '@')}`);
    html = html.split(`<span class="todo">[${key}]</span>`).join(safe);
  }
  writeFileSync(page, html);
  for (const match of html.matchAll(/class="todo">\[([^\]]+)\]/g)) left.push(`${page}: [${match[1]}]`);
}

if (left.length) {
  console.log(`Blanks left (${left.length}):\n${left.join('\n')}`);
  if (flag === '--strict') {
    console.error('Live build: fill these repository variables before publishing (docs in scripts/fill-legal.mjs).');
    process.exit(1);
  }
} else {
  console.log('Legal pages: every blank filled.');
}

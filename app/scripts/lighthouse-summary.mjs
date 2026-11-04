// Prints the numbers of a Lighthouse JSON report: score, FCP, LCP, TBT,
// CLS, Speed Index, transferred bytes (total and by type) and the LCP element.
// node scripts/lighthouse-summary.mjs lighthouse/after.json
import { readFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const audit = (id) => report.audits[id];
  const ms = (id) => `${Math.round(audit(id)?.numericValue ?? NaN)} ms`;
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const items = audit('resource-summary')?.details?.items ?? [];
  const byType = items.map((item) => `${item.resourceType} ${kb(item.transferSize)} (${item.requestCount})`).join(', ');
  const lcpElement = audit('largest-contentful-paint-element')?.details?.items?.[0]?.items?.[0]?.node?.snippet ?? '?';
  console.log(file);
  console.log(`  score ${Math.round(report.categories.performance.score * 100)}  FCP ${ms('first-contentful-paint')}  LCP ${ms('largest-contentful-paint')}  TBT ${ms('total-blocking-time')}  CLS ${audit('cumulative-layout-shift')?.numericValue?.toFixed(3)}  SI ${ms('speed-index')}`);
  console.log(`  transferred ${kb(audit('total-byte-weight')?.numericValue ?? 0)}: ${byType}`);
  console.log(`  LCP element ${lcpElement}`);
}

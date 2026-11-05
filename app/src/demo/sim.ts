// Demo only: the server's refusals made clickable (D118). Add ?sim= to the
// address, several separated by commas, e.g. ./?sim=preview-limit,report-limit#/
// The happy path stays the same without it. Photo refusals also come from
// the file name (fake-db.ts judgePhoto: toolarge, badtype, dailycap, checklimit).
//
// check-limit       check-photo answers 429 once (Try again checks the same file, no new upload)
// upload-cap        the photos bucket refuses the upload: 30 photos a day (until UTC midnight)
// too-large         the photos bucket refuses the upload: over 10 MB
// bad-type          the photos bucket refuses the upload: not JPEG, PNG, WebP or HEIC
// captcha-photo     Turnstile refuses the guest session once (consent tick)
// captcha-code      Turnstile refuses Send code once
// captcha-preview   start-preview answers 403 captcha_failed twice, once
// preview-limit     start-preview answers 429 (free previews per IP and per day)
// preview-off       start-preview answers 503 preview_unavailable
// generation-limit  start-generation answers 429 (paid videos per hour)
// report-limit      reports answer 429 PT429 (reports per day)
// free-preview      the free 2 s preview button comes back (off on the site since D139; read by config.ts)

export const SIMULATIONS = [
  'check-limit',
  'upload-cap',
  'too-large',
  'bad-type',
  'captcha-photo',
  'captcha-code',
  'captcha-preview',
  'preview-limit',
  'preview-off',
  'generation-limit',
  'report-limit',
  'free-preview',
] as const;

export type Simulation = (typeof SIMULATIONS)[number];

/** The simulations named in ?sim= of [search]; unknown names are ignored. */
export function readSimulations(search: string): Set<Simulation> {
  const raw = new URLSearchParams(search).get('sim') ?? '';
  const names = raw.split(',').map((name) => name.trim().toLowerCase());
  return new Set(names.filter((name): name is Simulation => (SIMULATIONS as readonly string[]).includes(name)));
}

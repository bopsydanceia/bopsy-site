// The language of the app, chosen once at startup: ?lang=fr|en (the landing
// passes it), else the choice stored by the FR/EN switch, else the browser
// languages (fr* gives French), else English. Changing it reloads the page.

export type Locale = 'en' | 'fr';
export const LOCALES: readonly Locale[] = ['en', 'fr'];
export const LOCALE_KEY = 'bopsy.lang';

function asLocale(value: string | null | undefined): Locale | null {
  const lower = (value ?? '').trim().toLowerCase();
  return (LOCALES as readonly string[]).includes(lower) ? (lower as Locale) : null;
}

export interface LocaleSignals {
  /** location.search, e.g. "?lang=fr". */
  search: string;
  /** The stored choice of the switch, if any. */
  stored: string | null;
  /** navigator.languages, in order of preference. */
  languages: readonly string[];
}

/** Pure: the locale for these signals. */
export function detectLocale({ search, stored, languages }: LocaleSignals): Locale {
  const query = asLocale(new URLSearchParams(search).get('lang'));
  if (query) return query;
  const saved = asLocale(stored);
  if (saved) return saved;
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    if (primary === 'fr') return 'fr';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

function store(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

function startupLocale(): Locale {
  if (typeof location === 'undefined' || typeof navigator === 'undefined') return 'en';
  const signals: LocaleSignals = {
    search: location.search,
    stored: readStored(),
    languages: navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en'],
  };
  const locale = detectLocale(signals);
  // A language given by the landing sticks for the next visits.
  if (asLocale(new URLSearchParams(signals.search).get('lang'))) store(locale);
  return locale;
}

/** The active locale for the whole visit. */
export const LOCALE: Locale = startupLocale();

/** BCP 47 tag for Intl. */
export const LOCALE_TAG = LOCALE === 'fr' ? 'fr-FR' : 'en-US';

if (typeof document !== 'undefined') document.documentElement.lang = LOCALE;

/** The FR/EN switch: stores the choice, drops ?lang= and reloads. */
export function switchLocale(locale: Locale): void {
  store(locale);
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  if (url.href === location.href) location.reload();
  else location.replace(url.href);
}

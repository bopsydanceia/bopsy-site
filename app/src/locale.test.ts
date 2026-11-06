import { describe, expect, test } from 'vitest';
import { dictionaries, t } from './copy';
import { linksFor } from './config';
import { detectLocale, LOCALE } from './locale';

describe('locale detection', () => {
  const none = { search: '', stored: null, languages: [] as string[] };

  test('?lang= first, then the stored choice, then the browser languages, else English', () => {
    expect(detectLocale({ ...none, search: '?lang=fr', stored: 'en', languages: ['en-US'] })).toBe('fr');
    expect(detectLocale({ ...none, search: '?sim=x&lang=EN', stored: 'fr', languages: ['fr-FR'] })).toBe('en');
    expect(detectLocale({ ...none, stored: 'fr', languages: ['en-US'] })).toBe('fr');
    expect(detectLocale({ ...none, languages: ['fr-CA', 'en'] })).toBe('fr');
    expect(detectLocale({ ...none, languages: ['de-DE', 'fr'] })).toBe('fr');
    expect(detectLocale({ ...none, languages: ['en-GB', 'fr-FR'] })).toBe('en');
    expect(detectLocale({ ...none, languages: ['de-DE', 'es'] })).toBe('en');
    expect(detectLocale(none)).toBe('en');
  });

  test('unknown values are ignored', () => {
    expect(detectLocale({ ...none, search: '?lang=de', stored: 'xx', languages: ['fr'] })).toBe('fr');
  });

  test('the tests run in English', () => {
    expect(LOCALE).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(t.pickDance).toBe('Pick a trend');
  });
});

describe('dictionaries', () => {
  const { en, fr } = dictionaries;

  test('French has every key of English, with the same kind of value', () => {
    const shape = (value: unknown): unknown =>
      typeof value === 'function'
        ? `function/${(value as (...args: unknown[]) => unknown).length}`
        : Array.isArray(value)
          ? `array/${value.length}`
          : value && typeof value === 'object'
            ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape((value as Record<string, unknown>)[key])]))
            : typeof value;
    expect(shape(fr)).toEqual(shape(en));
  });

  test('French texts are French', () => {
    expect(fr.pickDance).toBe('Choisis ta trend');
    expect(fr.makeVideo).toBe('Lancer ma vidéo');
    expect(fr.coins(1)).toBe('1 pièce');
    expect(fr.coins(60)).toBe('60 pièces');
    expect(fr.planTitle({ price: '7,99 €', period: 'week', intro: null })).toBe('7,99 € / semaine');
    const same = Object.keys(en).filter((key) => typeof en[key as keyof typeof en] === 'string' && en[key as keyof typeof en] === fr[key as keyof typeof fr]);
    // "trend" and "HOT" are the same words in French (anglicismes of the target).
    expect(same.sort()).toEqual(['badgeHot', 'danceFallback', 'danceLabel', 'navDances', 'ok', 'wordmark']);
  });

  test('legal links: the French pages live under fr/', () => {
    expect(linksFor('en').terms).toBe('../terms/');
    expect(linksFor('fr')).toMatchObject({ terms: '../fr/terms/', privacy: '../fr/privacy/', support: '../fr/support/', deleteData: '../fr/delete-data/' });
  });
});

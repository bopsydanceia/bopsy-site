import { describe, expect, test } from 'vitest';
import { deviceOf, inAppOf, sourceOf } from './analytics';

describe('analytics (D152)', () => {
  test('the ad source: utm first, then the click ids, then the referring site', () => {
    expect(sourceOf('?utm_source=tiktok&utm_medium=paid&utm_campaign=grandma', '', 'bopsyia.com')).toEqual({ source: 'tiktok', medium: 'paid', campaign: 'grandma', referrer: null });
    expect(sourceOf('?ttclid=abc', '', 'bopsyia.com')).toMatchObject({ source: 'tiktok', medium: 'paid' });
    expect(sourceOf('?fbclid=abc', 'https://l.facebook.com/', 'bopsyia.com')).toMatchObject({ source: 'facebook', referrer: 'l.facebook.com' });
    expect(sourceOf('', 'https://www.google.com/search', 'bopsyia.com')).toMatchObject({ source: null, referrer: 'google.com' });
    // Our own pages are not a source.
    expect(sourceOf('', 'https://bopsyia.com/', 'bopsyia.com').referrer).toBeNull();
  });

  test('device and in-app browser', () => {
    const tiktok = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit Mobile Safari musical_ly_2024';
    expect(deviceOf(tiktok, 390)).toBe('mobile');
    expect(inAppOf(tiktok)).toBe('tiktok');
    expect(inAppOf('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe('instagram');
    expect(inAppOf('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450]')).toBe('facebook');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0) Chrome/130', 1440)).toBe('desktop');
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17)', 820)).toBe('tablet');
  });
});

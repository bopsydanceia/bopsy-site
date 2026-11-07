import { describe, expect, test } from 'vitest';
import { motionAllowed, PlaybackPool, playCap, type Clip } from './card-motion';

function clip(name: string, log: string[]): Clip {
  return { start: () => log.push(`+${name}`), stop: () => log.push(`-${name}`) };
}

describe('PlaybackPool (D145)', () => {
  test('plays visible clips up to the cap, the others wait', () => {
    const log: string[] = [];
    const pool = new PlaybackPool(2);
    const [a, b, c] = ['a', 'b', 'c'].map((name) => clip(name, log));
    pool.show(a!);
    pool.show(b!);
    pool.show(c!);
    expect(log).toEqual(['+a', '+b']);
    expect(pool.playingCount).toBe(2);
    expect(pool.isPlaying(c!)).toBe(false);
  });

  test('a clip leaving the screen stops and frees its slot for the oldest waiting one', () => {
    const log: string[] = [];
    const pool = new PlaybackPool(1);
    const [a, b, c] = ['a', 'b', 'c'].map((name) => clip(name, log));
    pool.show(a!);
    pool.show(b!);
    pool.show(c!);
    pool.hide(a!);
    expect(log).toEqual(['+a', '-a', '+b']);
    expect(pool.isPlaying(b!)).toBe(true);
  });

  test('a waiting clip that leaves never starts; showing twice starts once', () => {
    const log: string[] = [];
    const pool = new PlaybackPool(1);
    const [a, b] = ['a', 'b'].map((name) => clip(name, log));
    pool.show(a!);
    pool.show(a!);
    pool.show(b!);
    pool.hide(b!);
    pool.hide(a!);
    pool.hide(a!);
    expect(log).toEqual(['+a', '-a']);
    expect(pool.playingCount).toBe(0);
  });

  test('4 clips at once on a phone, 8 on a computer', () => {
    expect(playCap(false)).toBe(4);
    expect(playCap(true)).toBe(8);
  });
});

describe('motionAllowed', () => {
  const fake = (reduced: boolean, saveData?: boolean, observer: unknown = class {}) =>
    ({
      matchMedia: () => ({ matches: reduced }),
      navigator: saveData === undefined ? {} : { connection: { saveData } },
      IntersectionObserver: observer,
    }) as unknown as Window;

  test('static with prefers-reduced-motion or Save-Data', () => {
    expect(motionAllowed(fake(false))).toBe(true);
    expect(motionAllowed(fake(true))).toBe(false);
    expect(motionAllowed(fake(false, true))).toBe(false);
    expect(motionAllowed(fake(false, false))).toBe(true);
  });

  test('static without IntersectionObserver', () => {
    expect(motionAllowed(fake(false, undefined, null))).toBe(false);
  });
});

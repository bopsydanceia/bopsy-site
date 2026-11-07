import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchDances } from './catalog';

const row = { id: 'd', slug: 'groove-jam', name: 'Groove Jam', family: 'trends', preview_url: 'https://cdn.example.com/p.jpg', cost: 60, duration_seconds: 8, is_new: false, is_hot: true, sort: 1 };

/** Stubs fetch with [answers] in order; returns the requested URLs. */
function respond(...answers: Array<{ status: number; body?: unknown }>): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const answer = answers.shift() ?? { status: 500 };
      return new Response(JSON.stringify(answer.body ?? { message: 'permission denied' }), { status: answer.status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDances (D145)', () => {
  test('reads the demo clips of the cards', async () => {
    const calls = respond({ status: 200, body: [{ ...row, preview_video_url: 'https://cdn.example.com/v.mp4' }] });
    const dances = await fetchDances();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('preview_video_url');
    expect(dances[0]).toMatchObject({ slug: 'groove-jam', previewVideoUrl: 'https://cdn.example.com/v.mp4' });
  });

  test.each([401, 403])('column not granted yet (%i): once more without it, posters only', async (status) => {
    const calls = respond({ status }, { status: 200, body: [row] });
    const dances = await fetchDances();
    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toContain('preview_video_url');
    expect(dances[0]).toMatchObject({ posterUrl: 'https://cdn.example.com/p.jpg', previewVideoUrl: null });
  });

  test('retries once only, and never on other errors', async () => {
    const twice = respond({ status: 401 }, { status: 401 });
    await expect(fetchDances()).rejects.toThrow('dances 401');
    expect(twice).toHaveLength(2);
    const once = respond({ status: 500 });
    await expect(fetchDances()).rejects.toThrow('dances 500');
    expect(once).toHaveLength(1);
  });
});

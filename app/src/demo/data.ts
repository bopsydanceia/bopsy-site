// Demo catalogue and store products (D118): names from the app's mock-up
// (danceName* of app_en.arb), posters made from its demo photos and the clips
// of the cards from the demo results (people only); prices of
// design/SPEC.md and C5, used only by the fake RevenueCat offerings.
import type { Dance } from '../core/types';

const asset = (file: string) => `${import.meta.env.BASE_URL}demo/${file}`;

export const DEMO_DANCES: Dance[] = [
  { id: '00000000-0000-4000-8000-000000000001', slug: 'street-bounce', name: 'Street Bounce', family: 'trends', posterUrl: asset('man-dance.webp'), previewVideoUrl: asset('man-result.mp4'), cost: 60, durationSeconds: 8, isNew: true, isHot: false, sort: 1 },
  { id: '00000000-0000-4000-8000-000000000002', slug: 'hip-sway', name: 'Hip Sway', family: 'trends', posterUrl: asset('woman-dance.webp'), previewVideoUrl: asset('woman-result.mp4'), cost: 60, durationSeconds: 8, isNew: false, isHot: true, sort: 2 },
  { id: '00000000-0000-4000-8000-000000000003', slug: 'grandma-groove', name: 'Grandma Groove', family: 'trends', posterUrl: asset('mamie-dance.webp'), previewVideoUrl: asset('mamie-result.mp4'), cost: 60, durationSeconds: 8, isNew: false, isHot: false, sort: 3 },
  { id: '00000000-0000-4000-8000-000000000004', slug: 'sunset-sway', name: 'Sunset Sway', family: 'party', posterUrl: asset('woman-dance.webp'), previewVideoUrl: asset('woman-result.mp4'), cost: 60, durationSeconds: 8, isNew: false, isHot: false, sort: 4 },
  { id: '00000000-0000-4000-8000-000000000005', slug: 'kitchen-boogie', name: 'Kitchen Boogie', family: 'party', posterUrl: asset('man-dance.webp'), previewVideoUrl: asset('man-result.mp4'), cost: 60, durationSeconds: 8, isNew: false, isHot: true, sort: 5 },
  { id: '00000000-0000-4000-8000-000000000006', slug: 'arms-up', name: 'Arms Up', family: 'victory', posterUrl: asset('mamie-dance.webp'), previewVideoUrl: asset('mamie-result.mp4'), cost: 60, durationSeconds: 8, isNew: true, isHot: false, sort: 6 },
  { id: '00000000-0000-4000-8000-000000000007', slug: 'slow-roll', name: 'Slow Roll', family: 'victory', posterUrl: asset('man-dance.webp'), previewVideoUrl: asset('man-result.mp4'), cost: 60, durationSeconds: 8, isNew: false, isHot: false, sort: 7 },
];

/** Sample photos offered in demo mode (their names pass the fake photo check). */
export const DEMO_SAMPLES = [
  { file: 'man-sit.jpg', label: 'Man', url: asset('man-sit.jpg') },
  { file: 'mamie-sit.jpg', label: 'Grandma', url: asset('mamie-sit.jpg') },
];

export type DemoClip = 'man' | 'mamie' | 'woman';

export function clipUrl(clip: DemoClip, preview: boolean): string {
  return asset(`${clip}-${preview ? 'preview' : 'result'}.mp4`);
}

export function sampleUrl(fileName: string): string | null {
  return DEMO_SAMPLES.find((sample) => sample.file === fileName)?.url ?? null;
}

/** The fake store: RevenueCat Web Billing products of the same ids (D111). */
export const DEMO_PRODUCTS = {
  bopsy_weekly: { kind: 'plan', period: 'week', priceMicros: 9_990_000, introMicros: 7_990_000, introWeeks: 2, coins: 180 },
  bopsy_yearly: { kind: 'plan', period: 'year', priceMicros: 79_990_000, introMicros: null, introWeeks: 0, coins: 240 },
  bopsy_coins_600: { kind: 'pack', priceMicros: 14_990_000, coins: 600, bestValue: false },
  bopsy_coins_1500: { kind: 'pack', priceMicros: 29_990_000, coins: 1500, bestValue: true },
} as const;

export type DemoProductId = keyof typeof DEMO_PRODUCTS;

/** Server timings of the demo (app_config and the fake providers). */
export const DEMO_TIMING = {
  estimatedMinutes: 1,
  checkMs: 1_200,
  previewMs: 6_000,
  queuedMs: 1_000,
  renderMs: 20_000,
  slowRenderMs: 75_000,
  /** RevenueCat webhook latency after a purchase. */
  webhookMs: 1_500,
  timeoutMs: 10 * 60_000,
};

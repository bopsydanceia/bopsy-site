// Live services (D117): Supabase and RevenueCat behind the same ports.
// Chosen at build time by vite.config.ts (alias "#services") when the four
// live VITE_ values are set; supabase-js, Turnstile and purchases-js load
// on demand.
import type { Services } from './core/ports';
import { LiveBackend } from './live/live-backend';

export function createServices(): Services {
  const backend = new LiveBackend();
  return { backend, billing: () => import('./live/live-billing').then((module) => new module.LiveBilling()) };
}

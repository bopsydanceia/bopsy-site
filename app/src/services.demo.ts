// Demo services (D118): the in-memory backend and the simulated checkout.
// Chosen at build time by vite.config.ts (alias "#services") when the
// three VITE_ values are missing; the live code is not in this bundle.
import type { Services } from './core/ports';
import { FakeBackend } from './demo/fake-backend';

export function createServices(): Services {
  const backend = new FakeBackend({ persist: true });
  return { backend, billing: () => import('./demo/fake-billing').then((module) => new module.FakeBilling(backend)) };
}

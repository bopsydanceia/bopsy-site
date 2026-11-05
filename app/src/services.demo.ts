// Demo services (D118): the in-memory backend and the simulated checkout.
// Chosen at build time by vite.config.ts (alias "#services") when the four
// live VITE_ values are missing; the live code is not in this bundle.
// ?sim= in the address simulates the server's refusals (demo/sim.ts).
import type { Services } from './core/ports';
import { FakeBackend } from './demo/fake-backend';
import { readSimulations } from './demo/sim';

export function createServices(): Services {
  const backend = new FakeBackend({ persist: true, sim: readSimulations(location.search) });
  return { backend, billing: () => import('./demo/fake-billing').then((module) => new module.FakeBilling(backend)) };
}

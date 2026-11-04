// The catalogue of the first screen with one fetch to PostgREST, without
// loading supabase-js: the first screen stays light (D108). Needs the
// read-only grant of active dances to the anon role (README, server side).
import { KEYS } from '../config';
import type { Dance } from '../core/types';
import { DANCE_COLUMNS, danceFromRow, type DanceRow } from './rows';

export async function fetchDances(accessToken?: string): Promise<Dance[]> {
  const url = `${KEYS.supabaseUrl}/rest/v1/dances?select=${DANCE_COLUMNS}&active=eq.true&order=sort.asc`;
  const response = await fetch(url, {
    headers: { apikey: KEYS.supabaseAnonKey, authorization: `Bearer ${accessToken ?? KEYS.supabaseAnonKey}` },
  });
  if (!response.ok) throw new Error(`dances ${response.status}`);
  return ((await response.json()) as DanceRow[]).map(danceFromRow);
}

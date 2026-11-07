// The catalogue of the first screen with one fetch to PostgREST, without
// loading supabase-js: the first screen stays light (D108). Needs the
// read-only grant of active dances to the anon role (README, server side).
//
// D145: the cards play the demo clip of each move (preview_video_url). Until
// the column is granted to anon, a select naming it answers 401/403: the
// catalogue is then read once more with the old columns, posters only.
import { KEYS } from '../config';
import type { Dance } from '../core/types';
import { DANCE_COLUMNS, DANCE_COLUMNS_WITH_VIDEO, danceFromRow, type DanceRow } from './rows';

function request(columns: string, accessToken?: string): Promise<Response> {
  const url = `${KEYS.supabaseUrl}/rest/v1/dances?select=${columns}&active=eq.true&order=sort.asc`;
  return fetch(url, {
    headers: { apikey: KEYS.supabaseAnonKey, authorization: `Bearer ${accessToken ?? KEYS.supabaseAnonKey}` },
  });
}

export async function fetchDances(accessToken?: string): Promise<Dance[]> {
  let response = await request(DANCE_COLUMNS_WITH_VIDEO, accessToken);
  if (response.status === 401 || response.status === 403) response = await request(DANCE_COLUMNS, accessToken);
  if (!response.ok) throw new Error(`dances ${response.status}`);
  return ((await response.json()) as DanceRow[]).map(danceFromRow);
}

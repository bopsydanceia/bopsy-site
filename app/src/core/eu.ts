// Who sees the withdrawal waiver before paying (D115): buyers who are
// probably in the EU or the EEA, where the 14-day right of withdrawal applies
// to digital content. Signals: the device time zone, then the currency of
// the offer. A false positive costs one checkbox; a false negative only
// leaves that buyer their right of withdrawal.

const EU_EEA_TIME_ZONES = new Set([
  // EU 27
  'Europe/Vienna', 'Europe/Brussels', 'Europe/Sofia', 'Europe/Zagreb', 'Asia/Nicosia', 'Asia/Famagusta',
  'Europe/Nicosia', 'Europe/Prague', 'Europe/Copenhagen', 'Europe/Tallinn', 'Europe/Helsinki', 'Europe/Mariehamn',
  'Europe/Paris', 'Europe/Berlin', 'Europe/Busingen', 'Europe/Athens', 'Europe/Budapest', 'Europe/Dublin',
  'Europe/Rome', 'Europe/Riga', 'Europe/Vilnius', 'Europe/Luxembourg', 'Europe/Malta', 'Europe/Amsterdam',
  'Europe/Warsaw', 'Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores', 'Europe/Bucharest',
  'Europe/Bratislava', 'Europe/Ljubljana', 'Europe/Madrid', 'Africa/Ceuta', 'Atlantic/Canary',
  'Europe/Stockholm',
  // Outermost regions
  'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'Indian/Reunion', 'Indian/Mayotte',
  'America/Marigot',
  // EEA
  'Atlantic/Reykjavik', 'Europe/Oslo', 'Arctic/Longyearbyen', 'Europe/Vaduz',
]);

const EU_EEA_CURRENCIES = new Set(['EUR', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'NOK']);

export interface BuyerSignals {
  timeZone: string | null;
  currency: string | null;
}

export function isLikelyEuBuyer({ timeZone, currency }: BuyerSignals): boolean {
  if (timeZone && EU_EEA_TIME_ZONES.has(timeZone)) return true;
  return currency !== null && EU_EEA_CURRENCIES.has(currency.toUpperCase());
}

export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** ISO 3166-1 Alpha-2 Formatprüfung (Existenzprüfung gegen Länderliste folgt in Phase 4). */
export const isCountryCode = (c: string | null | undefined): c is string => !!c && /^[A-Z]{2}$/.test(c);

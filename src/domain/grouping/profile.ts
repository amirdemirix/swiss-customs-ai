export const GROUPABLE_FIELDS = [
  "tariffNumber",
  "statisticalKey",
  "originCountry",
  "preferenceStatus",
  "customsProcedure",
] as const;
export type GroupableField = (typeof GROUPABLE_FIELDS)[number];

export interface GroupingProfileConfig {
  name: string;
  /** Merkmale, die gleich sein müssen, damit Positionen zusammengefasst werden */
  keyFields: GroupableField[];
  /** Zusätzliche Merkmale aus extraAttributes (z. B. "additionalCode", "permitNumber", "vatCode") */
  extraKeys: string[];
  /** Fehlt eines dieser Merkmale, wird die Position NICHT zusammengefasst */
  requiredFields: (GroupableField | `extra.${string}`)[];
}

/**
 * Konservatives Standardprofil (Annahme A3). Bewusst streng: lieber eine Anmeldeposition
 * zu viel als eine unzulässige Zusammenfassung.
 */
export const DEFAULT_PROFILE: GroupingProfileConfig = {
  name: "Standard CH Einfuhr (konservativ)",
  keyFields: ["tariffNumber", "statisticalKey", "originCountry", "preferenceStatus", "customsProcedure"],
  extraKeys: [],
  requiredFields: ["tariffNumber", "originCountry"],
};

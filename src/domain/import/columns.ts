/** Zielfelder eines Rechnungspositions-Imports und Synonyme für die automatische Zuordnung. */
export const IMPORT_FIELDS = {
  invoiceNumber: { label: "Rechnungsnummer", synonyms: ["rechnungsnummer", "rechnung nr", "rechnung", "re nr", "invoice no", "invoice number", "invoice", "facture", "fattura", "beleg nr"] },
  invoiceDate: { label: "Rechnungsdatum", synonyms: ["rechnungsdatum", "datum", "invoice date", "date", "date facture", "data fattura"] },
  supplierName: { label: "Lieferant", synonyms: ["lieferant", "supplier", "vendor", "absender", "fournisseur", "fornitore", "shipper"] },
  currency: { label: "Währung", synonyms: ["währung", "waehrung", "currency", "curr", "devise", "valuta", "whg"] },
  lineNo: { label: "Positionsnummer", synonyms: ["pos", "position", "pos nr", "line", "line no", "zeile"] },
  articleNumber: { label: "Artikelnummer", synonyms: ["artikelnummer", "artikel nr", "artikel", "art nr", "material", "sku", "part number", "part no", "item code", "item no", "item number", "article", "référence", "codice"] },
  description: { label: "Warenbeschreibung", synonyms: ["beschreibung", "warenbeschreibung", "bezeichnung", "description", "goods description", "designation", "désignation", "descrizione", "text"] },
  tariffNumber: { label: "Zolltarifnummer", synonyms: ["zolltarifnummer", "tarifnummer", "zolltarif", "tarif nr", "hs code", "hs", "hscode", "commodity code", "customs tariff", "taric", "statistical number", "numéro tarifaire", "voce doganale"] },
  statisticalKey: { label: "Statistischer Schlüssel", synonyms: ["statistischer schlüssel", "schlüssel", "stat schlüssel", "statistical key"] },
  originCountry: { label: "Ursprungsland", synonyms: ["ursprungsland", "ursprung", "origin", "country of origin", "coo", "made in", "pays d'origine", "origine", "paese di origine"] },
  preference: { label: "Präferenz", synonyms: ["präferenz", "praeferenz", "preference", "preferential", "präferenzberechtigt"] },
  quantity: { label: "Menge", synonyms: ["menge", "anzahl", "qty", "quantity", "quantité", "quantità", "stk", "stück"] },
  unit: { label: "Mengeneinheit", synonyms: ["einheit", "mengeneinheit", "me", "unit", "uom", "unité", "unità"] },
  unitPrice: { label: "Einzelpreis", synonyms: ["einzelpreis", "preis", "stückpreis", "unit price", "price", "prix unitaire", "prezzo unitario"] },
  lineAmount: { label: "Positionswert", synonyms: ["positionswert", "betrag", "gesamtpreis", "total", "amount", "line total", "value", "wert", "warenwert", "montant", "importo"] },
  netWeightKg: { label: "Nettogewicht (kg)", synonyms: ["nettogewicht", "netto", "eigenmasse", "net weight", "nw", "net kg", "poids net", "peso netto"] },
  grossWeightKg: { label: "Bruttogewicht (kg)", synonyms: ["bruttogewicht", "brutto", "rohmasse", "gross weight", "gw", "gross kg", "poids brut", "peso lordo"] },
  packaging: { label: "Verpackung", synonyms: ["verpackung", "packstücke", "colli", "packages", "packaging", "pkgs"] },
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;
export type ColumnMap = Partial<Record<ImportField, number>>; // Zielfeld → Spaltenindex

export const normHeader = (h: string) =>
  h.toLowerCase().replace(/[._\-/()#:]+/g, " ").replace(/\s+/g, " ").replace(/\b(kg|chf|eur|usd)\b/g, "").trim();

/** Signatur der Kopfzeile, um gespeicherte Zuordnungen wiederzuerkennen. */
export const headerSignature = (headers: string[]) => headers.map(normHeader).join("|");

/**
 * Ordnet Spalten anhand von Synonymen zu. Exakte Treffer haben Vorrang vor Teiltreffern;
 * jede Spalte wird höchstens einem Feld zugeordnet. Unklare Spalten bleiben unzugeordnet.
 */
export function autoMapColumns(headers: string[]): ColumnMap {
  const normalized = headers.map(normHeader);
  const map: ColumnMap = {};
  const used = new Set<number>();
  const fields = Object.keys(IMPORT_FIELDS) as ImportField[];
  for (const pass of ["exact", "prefix"] as const) {
    for (const f of fields) {
      if (map[f] !== undefined) continue;
      const syns = IMPORT_FIELDS[f].synonyms;
      const idx = normalized.findIndex((h, i) => !used.has(i) && syns.some((s) => (pass === "exact" ? h === s : h.startsWith(s + " ") || h === s)));
      if (idx >= 0) { map[f] = idx; used.add(idx); }
    }
  }
  return map;
}

/** Sucht die Kopfzeile in den ersten Zeilen (Excel-Dateien haben oft Titelzeilen darüber). */
export function findHeaderRow(rows: string[][], maxScan = 15): number {
  let best = 0, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const score = Object.keys(autoMapColumns(rows[i])).length;
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

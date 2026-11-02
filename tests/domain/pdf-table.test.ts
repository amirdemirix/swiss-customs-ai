import { describe, expect, it } from "vitest";
import { reconstructPdfTable, type PdfTextItem } from "@/domain";

// Hilfsfunktion: Zeile aus [x, text]-Paaren auf Höhe y (Breite ≈ 4.5 pt je Zeichen)
const L = (y: number, cells: [number, string][]): PdfTextItem[] => cells.map(([x, str]) => ({ str, x, y, width: str.length * 4.5, height: 9 }));

describe("PDF-Tabellenerkennung", () => {
  it("erkennt Kopfzeile, Spalten, rechtsbündige Zahlen und ignoriert Fusstext", () => {
    const page = [
      ...L(800, [[40, "Muster AG"], [400, "Rechnung Nr. R-1"]]),
      ...L(700, [[40, "Pos"], [70, "Artikel"], [130, "Beschreibung"], [300, "Zolltarif"], [370, "Ursprung"], [430, "Menge"], [490, "Einzelpreis"], [560, "Betrag"]]),
      ...L(685, [[40, "1"], [70, "A-1"], [130, "Kugellager"], [300, "8482.1000"], [370, "DE"], [440, "10"], [505, "4.50"], [565, "45.00"]]),
      ...L(670, [[40, "2"], [70, "A-2"], [130, "Dichtung aus"], [300, "4016.9300"], [370, "IT"], [440, "100"], [505, "0.25"], [565, "25.00"]]),
      ...L(660, [[130, "vulkanisiertem Kautschuk"]]), // Folgezeile der Beschreibung
      ...L(640, [[490, "Total"], [565, "70.00"]]),
      ...L(600, [[40, "Bankverbindung: IBAN CH00 0000 0000 0000 0000 0 · Zahlbar 30 Tage"]]),
    ];
    const t = reconstructPdfTable([page])!;
    expect(t).not.toBeNull();
    expect(t.rows[0]).toEqual(["Pos", "Artikel", "Beschreibung", "Zolltarif", "Ursprung", "Menge", "Einzelpreis", "Betrag"]);
    expect(t.rows[1]).toEqual(["1", "A-1", "Kugellager", "8482.1000", "DE", "10", "4.50", "45.00"]);
    expect(t.rows[2][2]).toBe("Dichtung aus vulkanisiertem Kautschuk");
    expect(t.rows[3]).toEqual(["", "", "Total", "", "", "", "", "70.00"]);
    expect(t.rows).toHaveLength(4); // Bankverbindung nicht übernommen
  });
  it("setzt die Tabelle auf Folgeseiten mit wiederholter Kopfzeile fort und merkt sich die Seite", () => {
    const head = (y: number) => L(y, [[40, "Artikel"], [150, "Bezeichnung"], [350, "HS Code"], [420, "Qty"], [480, "Amount"]]);
    const p1 = [...head(700), ...L(680, [[40, "X1"], [150, "Ware 1"], [350, "8471.3000"], [420, "1"], [480, "100.00"]])];
    const p2 = [...L(780, [[40, "Seite 2"]]), ...head(700), ...L(680, [[40, "X2"], [150, "Ware 2"], [350, "8471.3000"], [420, "2"], [480, "200.00"]])];
    const t = reconstructPdfTable([p1, p2])!;
    expect(t.rows.slice(1).map((r) => r[0])).toEqual(["X1", "X2"]);
    expect(t.rowPages).toEqual([1, 1, 2]);
  });
  it("liefert nichts, wenn keine Positionstabelle vorhanden ist (z. B. Brief)", () => {
    expect(reconstructPdfTable([L(700, [[40, "Sehr geehrte Damen und Herren, anbei unsere Offerte."]])])).toBeNull();
  });
});

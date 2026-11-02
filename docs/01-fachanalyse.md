# 01 – Fachliche Analyse & Risiken

Stand: 2026-11-02 · Status: Phase 1 abgeschlossen, laufend zu ergänzen

## 1. Kernproblem

Ein Zolldeklarant überträgt heute Positionen aus vielen Handelsrechnungen manuell in Excel,
fasst sie nach Tarifnummer/Ursprung zusammen und erfasst das Ergebnis in e-dec bzw. Passar.
Die Fehlerquellen sind Abtippfehler, falsche Summen, vergessene Positionen, gemischte Währungen
und falsche Gewichte. **Der Wert der Software liegt in der korrekten, nachvollziehbaren
Konsolidierung — nicht in der KI an sich.** Die KI ist nur ein Erfassungshilfsmittel.

## 2. Verifizierte fachliche Grundlagen (offizielle Quellen)

| Thema | Erkenntnis | Quelle |
|---|---|---|
| Passar Einfuhr | Letzte Import-Anmeldung über e-dec am **30.09.2027**, danach nur noch Passar. Passar 2.0 (Einfuhr Standard) ab Q2/2026 nur für Pilotfirmen. | [BAZG Roadmap Passar 2 und 3](https://www.bazg.admin.ch/de/roadmap-passar-2-und-3), [BAZG Passar Einfuhr](https://www.bazg.admin.ch/de/passar-einfuhr) |
| ZAZ → GP-ID | ZAZ-Konten werden durch die Geschäftspartner-ID ersetzt, gekoppelt an Umstellung e-dec → Passar. | [BAZG GP-ID](https://www.bazg.admin.ch/de/passar-abloesung-zaz-konto-durch-gp-id) |
| Bemessungsgrundlage | Standard: **Bruttogewicht** (CHF je 100 kg brutto). Bruttogewicht = Eigengewicht + Umschliessungen/Füllmaterial/Warenträger, ohne wiederverwendbare Transporthilfsmittel (Paletten). | [BAZG Zollbemessungsgrundlagen](https://www.bazg.admin.ch/de/zollbemessungsgrundlagen-bruttogewicht-und-eigengewicht) |
| Eigenmasse | Reines Warengewicht, kg mit 3 Nachkommastellen. Für gewisse präferenzberechtigte Agrar-Verarbeitungsprodukte aus der EU massgebend. | [BAZG Hinweise Ausfüllen der Zollanmeldung](https://www.bazg.admin.ch/dam/de/sd-web/21lDTdCh9bsR/hinweise-ausfuellen-der-zollanmeldung-de.pdf) |
| Statistischer Schlüssel | Dreistellige Unteraufteilung der 8-stelligen Tarifnummer. | [Kurzanleitung Tares](https://www.bazg.admin.ch/dam/de/sd-web/PRbwTdyrELd5/kurzanleitung_tares.pdf) |

> **Konsequenz für das Produkt:** Das Bruttogewicht ist in der Schweiz zollrechtlich zentral
> (nicht „optional“). Der Masterprompt behandelt es als „soweit zuordenbar“ — in der Software
> wird es deshalb als **Pflichtfeld auf Ebene Anmeldeposition** geführt, das aber nie automatisch
> erfunden oder ohne dokumentierte Methode auf Positionen verteilt wird.

## 3. Annahmen (müssen fachlich bestätigt werden)

| ID | Annahme | Auswirkung im Code |
|---|---|---|
| A1 | Schweizer Tarifnummer = 8 Ziffern (`NNNN.NNNN`), plus 3-stelliger statistischer Schlüssel. | `src/domain/tariff/tariff-number.ts` |
| A2 | Rechnungen enthalten oft HS-6 oder EU-KN-8-Nummern des Lieferanten. **Diese sind nicht identisch mit der CH-Tarifnummer.** | Feld `tariffNumberSource` (`INVOICE`, `USER`, `AI_SUGGESTION`, `MASTER_DATA`) + Warnung |
| A3 | Anmeldepositionen trennen mindestens nach: Tarifnummer, stat. Schlüssel, Ursprungsland, Präferenzbehandlung, Zollverfahren/Veranlagungsart. Weitere Trennmerkmale (Zusatzcodes, Bewilligungen, MWST-Code, Zollerleichterung/Verwendungszweck, Zustand der Ware) konfigurierbar. | `GroupingProfile` in DB, `src/domain/grouping` |
| A4 | Umrechnungskurse: Kursquelle und Kursdatum werden pro Auftrag dokumentiert; welche Kursquelle verbindlich ist (BAZG/ESTV-Kurs am Tag der Annahme der Anmeldung) muss bestätigt werden. Keine Kurse werden hart codiert. | `ExchangeRate` mit `source`, `validOn` |
| A5 | Gewichte werden nie anteilig nach Wert auf Positionen verteilt, ausser der Benutzer wählt explizit eine dokumentierte Verteilmethode (wird protokolliert). | `WeightAllocationMethod` |
| A6 | Geldbeträge werden als Decimal (Prisma `Decimal(18,4)`) gespeichert und mit `decimal.js` gerechnet; Rundung erst auf Anmeldeebene (Banker's Rounding *nicht* angenommen — Standard: kaufmännisch HALF_UP, konfigurierbar). | `src/domain/money` |

## 4. Fachliche Risiken

1. **Falsche Tarifeinreihung durch KI** → KI-Tarifnummern werden nur als Vorschlag gespeichert, nie als bestätigt. Statusmodell `SUGGESTED → CONFIRMED` nur durch Benutzer mit Rolle Deklarant/Prüfer.
2. **Unzulässige Zusammenfassung** → Gruppierung nur bei voller Übereinstimmung aller Schlüsselmerkmale des aktiven Profils; fehlende Merkmale verhindern die Zusammenfassung („unvollständig“), statt als „leer = gleich“ behandelt zu werden.
3. **Gewichte** → Rechnungen nennen häufig nur ein Gesamtgewicht pro Sendung. Ohne Positionsgewicht wird die Anmeldeposition als „Gewicht fehlt“ (kritisch) markiert.
4. **Währung** → Zusammenfassung über verschiedene Rechnungswährungen erst nach dokumentierter Umrechnung; Originalwerte bleiben erhalten.
5. **Rabatte, Fracht, Versicherung, Incoterms** → beeinflussen den Zollwert/MWST-Bemessungsgrundlage. Rechnungsrabatte auf Kopfebene müssen auf Positionen verteilt werden – Methode ist fachlich zu klären (Frage F5).
6. **Datenschutz** → Upload an KI-Anbieter nur nach Freigabe auf Mandantenebene (`Tenant.aiProcessingConsent`) und mit dokumentiertem Auftragsbearbeitungsvertrag.
7. **Passar-Schnittstelle** → keine Integration behauptet. Export erfolgt als strukturierter Datensatz (JSON/Excel); Adapter-Schnittstelle vorbereitet.

## 5. Offene zollfachliche Fragen (vor Phase 6 zu klären)

| # | Frage |
|---|---|
| F1 | Welche Merkmale erzwingen in Ihrer Praxis eine separate Anmeldeposition (neben Tarif-Nr., stat. Schlüssel, Ursprung, Präferenz)? Z. B. Zusatzcode, Bewilligungspflicht, MWST-Code, Verwendungszweck, Veranlagungsart? |
| F2 | Welche Kursquelle verwenden Sie verbindlich für die Umrechnung (BAZG-Tageskurs, ESTV-Monatsmittelkurs, Bankkurs)? |
| F3 | Wie soll mit Sendungsgewichten umgegangen werden, die nur pro Packliste/Rechnung vorliegen? Manuelle Verteilung, Verteilung nach Nettogewicht, oder Pflicht zur Angabe pro Anmeldeposition? |
| F4 | Werden Lieferanten-HS-Codes als Ausgangspunkt akzeptiert, oder ist pro Kunde eine Artikelstammdatei (Artikel-Nr. → CH-Tarif-Nr.) massgebend? (Empfehlung: Artikelstamm pro Kunde.) |
| F5 | Behandlung von Kopfrabatten, Fracht- und Versicherungskosten bis zur Grenze: Verteilung nach Wert? |
| F6 | Müssen Zusatzmengen (z. B. Stück, Liter, Paar) pro Tarifnummer ausgewiesen werden, und sollen diese aus den Rechnungsmengen übernommen werden? |
| F7 | Ist ein Export-Fall (Ausfuhr) in der ersten Version erforderlich, oder zunächst nur Einfuhr? |
| F8 | Aufbewahrungsfrist der Originalbelege im System (gesetzlich i. d. R. 10 Jahre für Geschäftsbücher/Belege — mit Ihrem Rechtsdienst zu klären) und ob das System Archivsystem ist oder nur Arbeitsplattform. |
| F9 | Welcher KI-Hosting-Standort ist für Ihre Kunden akzeptabel (Anthropic API direkt, oder über einen Cloud-Anbieter mit Region EU/CH)? |

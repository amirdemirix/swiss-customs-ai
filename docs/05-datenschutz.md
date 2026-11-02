# 05 – Datenschutz & Datenverarbeitung

Grundlage: Schweizer Datenschutzgesetz (revDSG, seit 1.9.2023) und – bei Bezug zu EU-Personen – DSGVO.
Dieses Dokument beschreibt die technische Umsetzung; die rechtliche Beurteilung bleibt Sache der Betreiberin.

## Datenkategorien

Handelsrechnungen (Lieferanten, Empfänger, Preise, Waren), Kundendaten der Agentur, Benutzerkonten (Name, E-Mail,
Passwort-Hash), Protokolle (Benutzer, Zeit, IP bei Anmeldung).

## Datenflüsse

| Fluss | Wann | Schutz |
|---|---|---|
| Browser → Anwendung | immer | TLS (HSTS), Session-Cookie httpOnly/Secure/SameSite |
| Anwendung → Datenbank | immer | TLS zur DB; Belege AES-256-GCM-verschlüsselt, an Mandant gebunden |
| Anwendung → Anthropic (Claude API) | **nur** wenn (1) API-Schlüssel konfiguriert, (2) KI-Freigabe des Mandanten erteilt, (3) Benutzer die Erkennung für einen Beleg auslöst | TLS; jede Übermittlung als `AI_SEND` protokolliert (Datei, Hash, Modell) |

Excel/CSV-Importe und PDF-Textlayer werden **lokal** verarbeitet, ohne KI-Dienst.

## Technische und organisatorische Massnahmen (Auszug)

- Mandantentrennung auf jeder Abfrage (automatisch geprüft, Tests für Umgehungsversuche).
- Rollen: Administrator, Zolldeklarant, Prüfer, Nur Lesen; Schutz vor Aussperrung (letzter Admin).
- Passwörter bcrypt (Kosten 12), Richtlinie ≥ 12 Zeichen; Rate-Limit 5 Versuche / 15 min, instanzübergreifend.
- Sitzungen serverseitig, sofort widerrufbar (Rollenentzug, Deaktivierung, Passwortwechsel).
- Audit-Log für Anmeldungen, Fehlversuche, Änderungen (feldgenau), KI-Übermittlungen, Exporte, Löschungen.
- Aufbewahrungsfrist je Mandant; automatische Löschung der Originale abgeschlossener Aufträge (Metadaten bleiben).
- Löschfunktionen: Beleg (inkl. abgeleiteter Rechnungen), Auftrag (Admin, mit Bestätigung).

## Vor Produktivbetrieb zu klären

1. Auftragsbearbeitungsvertrag mit Hosting (Vercel/Neon) und KI-Anbieter (Anthropic); Prüfung Datenübermittlung ins Ausland.
2. Datenstandort: Für Kunden mit CH-Anforderung Variante Docker in CH-Rechenzentrum (docs/04-betrieb.md).
3. Aufbewahrungsfristen mit Rechtsdienst festlegen (Frage F8).
4. Verzeichnis der Bearbeitungstätigkeiten und Datenschutzerklärung für Endkunden.
5. Schlüsselrotation (Testschlüssel wurde im Entwicklungsverlauf sichtbar).

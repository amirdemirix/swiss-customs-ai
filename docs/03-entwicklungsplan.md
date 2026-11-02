# 03 – Entwicklungsplan

| Phase | Inhalt | Status | Abnahmekriterium |
|---|---|---|---|
| 1 | Analyse, Risiken, Architektur, Datenmodell | ✅ erledigt | Dokumente in `docs/` |
| 2 | Projektgerüst, Prisma-Schema + Migration, Designsystem, App-Shell, Domänenkern (Money, Tarif, Gruppierung, Validierung) inkl. Tests | ✅ erledigt | `npm test`, `npm run build` grün; Dashboard liest echte DB |
| 3 | Login mit DB-Sessions, Rollen & Rechte, Mandantenwechsel, Auftrag bearbeiten/Status/Löschen mit Änderungsverlauf, Kunden + Artikelstamm, Einstellungen (Benutzer, KI-Freigabe, Aufbewahrung, Passwort) | ✅ erledigt | 73 Tests + E2E mit 4 Rollen |
| 4 | Multi-Upload (Drag & Drop, Fortschritt je Datei), Typprüfung per Magic Bytes, AES-256-GCM-Ablage, SHA-256-Duplikate, PDF-Textlayer + Kopfdaten-Vorschläge mit Fundstelle, XLSX/CSV-Import mit Auto-Zuordnung, Vorschau, gespeicherten Zuordnungen und Quellzeilen; Umrechnungskurse (vorgezogen aus 6) | ✅ erledigt | 120 Tests + E2E mit synthetischen CSV/XLSX/PDF |
| 5 | Job-Worker, Claude-Extraktion (Zod), Kontrollansicht (PDF links, Tabelle rechts), Änderungsverlauf | offen | Extraktion mit Konfidenz & Quellverweis |
| 6 | Konsolidierung in DB, aufklappbare Zollübersicht, Währungsumrechnung, Plausibilitätsprüfungen | offen (Kernlogik bereits in Phase 2) | Gruppierungs- und Rundungstests |
| 7 | Excel-Export (4 Blätter), Prüfprotokoll | offen | Summen im Export = DB-Summen (Test) |
| 8 | Security-Härtung (RLS, Rate-Limits, CSP), Aufbewahrung/Löschung, Lasttest 5'000 Positionen | offen | Lasttest < 3 s Konsolidierung |
| 9 | Docker-Deployment, CH-Hosting, Backup, Betriebsdoku | offen | Staging-Umgebung |

# 03 – Entwicklungsplan

| Phase | Inhalt | Status | Abnahmekriterium |
|---|---|---|---|
| 1 | Analyse, Risiken, Architektur, Datenmodell | ✅ erledigt | Dokumente in `docs/` |
| 2 | Projektgerüst, Prisma-Schema + Migration, Designsystem, App-Shell, Domänenkern (Money, Tarif, Gruppierung, Validierung) inkl. Tests | ✅ erledigt | `npm test`, `npm run build` grün; Dashboard liest echte DB |
| 3 | Login mit DB-Sessions, Rollen & Rechte, Mandantenwechsel, Auftrag bearbeiten/Status/Löschen mit Änderungsverlauf, Kunden + Artikelstamm, Einstellungen (Benutzer, KI-Freigabe, Aufbewahrung, Passwort) | ✅ erledigt | 73 Tests + E2E mit 4 Rollen |
| 4 | Multi-Upload (Drag & Drop, Fortschritt je Datei), Typprüfung per Magic Bytes, AES-256-GCM-Ablage, SHA-256-Duplikate, PDF-Textlayer + Kopfdaten-Vorschläge mit Fundstelle, XLSX/CSV-Import mit Auto-Zuordnung, Vorschau, gespeicherten Zuordnungen und Quellzeilen; Umrechnungskurse (vorgezogen aus 6) | ✅ erledigt | 120 Tests + E2E mit synthetischen CSV/XLSX/PDF |
| 5 | Claude-Extraktion (Structured Outputs + Zod, Revalidierung jedes Werts, nur mit Freigabe), Kontrollansicht mit Korrektur, Aufteilen, Zusammenführen, Bestätigung, Verlauf | ✅ erledigt | KI-Dienst in Tests gemockt; E2E Kontrollansicht |
| 6 | Gruppierungsprofile bearbeitbar, Tarif-Datenstand (Import/Suche/Abgleich), Rechnungs- und Zollübersicht, Massen-Inserts | ✅ erledigt | Tests Datenstand + Abgleich |
| 7 | Excel-Export (4 Blätter, Formel- + Kontrollsummen), Anmeldevorbereitung als neutraler JSON-Datensatz (Adapter), Export-Protokoll mit SHA-256 | ✅ erledigt | Summen im Export = Berechnung (Test) |
| 8 | DB-Rate-Limit, CSP/COOP, Aufbewahrungs-Cron, Schlüsselrotation, Audit-Protokoll-Seite, Lasttest | ✅ erledigt (RLS als Empfehlung offen) | 5'000 Pos. in ~1.1 s |
| 9 | Vercel-Testumgebung, Dockerfile + Compose für CH-Hosting, Betriebs- und Datenschutzdoku | ✅ erledigt | Testumgebung online |

# 02 – Architektur

## Entscheid: Modularer Monolith (Next.js) + separater Job-Worker

| Schicht | Technologie | Begründung |
|---|---|---|
| UI | Next.js 15 (App Router), React 19, Tailwind, shadcn/ui-Muster, Lucide | Wie gefordert; Server Components halten grosse Tabellen schnell. |
| API | Server Actions + Route Handlers | Kein separates Backend nötig → niedrige Betriebskosten. |
| Domäne | Reines TypeScript in `src/domain` (keine Next/Prisma-Abhängigkeit) | Testbar, wiederverwendbar im Worker. |
| DB | PostgreSQL + Prisma | Mandantentrennung via `tenantId` auf jeder Tabelle + Repository-Guard; später zusätzlich Postgres Row-Level-Security. |
| Jobs | Postgres-basierte Queue (`ProcessingJob`-Tabelle, `SELECT … FOR UPDATE SKIP LOCKED`) | Keine Redis-Kosten; OCR/KI-Extraktion läuft asynchron in `worker/`. |
| Dateien | S3-kompatibler Speicher (z. B. Exoscale/Infomaniak in CH) mit serverseitiger Verschlüsselung; lokal: Dateisystem + AES-256-GCM | Datenresidenz Schweiz möglich. |
| PDF/OCR | `pdfjs`-Textlayer zuerst; nur ohne Textlayer OCR (Tesseract) oder Claude Vision | Text-PDFs brauchen keine KI-Bildverarbeitung → Kosten. |
| Excel | `exceljs` | Mehrblatt-Export mit Formeln/Formaten. |
| KI | Anthropic Claude API, Tool-Use/JSON-Schema-Ausgabe, Zod-Validierung | Pro Feld: Wert, Konfidenz, Quellseite/-zeile. |
| Auth | Eigene serverseitige Sessions (DB), bcrypt (Kosten 12), httpOnly-Cookie; SSO/SAML später | Entscheid Phase 3: Auth.js-Credentials unterstützt keine DB-Sessions; wir brauchen sofort widerrufbare Sitzungen (Rollenentzug, Deaktivierung, Passwortwechsel). |

## Modulgrenzen

```
src/
  domain/            # Reine Fachlogik, 100 % unit-getestet
    money/           # Decimal-Arithmetik, Währungsumrechnung
    tariff/          # Tarifnummern-Format, Normalisierung
    grouping/        # Konsolidierung nach Gruppierungsprofil
    validation/      # Prüfregeln (Fehler/Warnung/Info)
    weights/         # Gewichtsaggregation
  server/
    db.ts            # Prisma-Client
    tenant.ts        # Mandantenkontext / Guards
    repositories/    # Zugriff immer mit tenantId
    extraction/      # KI-Adapter (Claude), Zod-Schemas
    parsing/         # PDF/Excel/CSV-Parser
    storage/         # Datei-Ablage (verschlüsselt)
    export/          # Excel, Passar-Vorbereitung (Adapter-Interface)
  app/               # Next.js Routen (UI)
  components/        # Designsystem
```

## Datenfluss

1. Upload → `Document` (Hash SHA-256 → Duplikaterkennung auf Dateiebene) → `ProcessingJob`.
2. Worker: Parsing (Text/Tabellen) → falls nötig OCR → KI-Extraktion → Zod-Validierung.
3. Ergebnis → `Invoice` + `InvoiceLine` mit `ExtractedField`-Metadaten (Konfidenz, Seite, Bounding Box).
4. Validierung → `ValidationIssue`.
5. Konsolidierung → `DeclarationLine` + `DeclarationLineSource` (n:m zu `InvoiceLine`, nichts geht verloren).
6. Kontrolle/Korrektur → `AuditLog` (jede Feldänderung mit alt/neu, Benutzer, Zeit).
7. Export → `ExportFile` (Excel / strukturierte JSON-Vorbereitung für Passar).

## KI-Grundsätze

- Prompt verlangt explizit `null` für fehlende Werte; Zod verwirft erfundene Formate.
- Werte mit Konfidenz < Schwelle (Mandanteneinstellung, Default 0.85) → Status `NEEDS_REVIEW`.
- Plausibilitätskontrolle unabhängig von der KI: Menge × Einzelpreis ≈ Positionswert, Summe Positionen = Rechnungstotal.
- KI-Tarifvorschläge sind getrennt gespeichert (`tariffNumberSource = AI_SUGGESTION`) und blockieren den Export, bis sie bestätigt sind.
- Kein Datenversand an KI ohne `Tenant.aiProcessingConsent = true`.

## Passar

Es wird **keine** Direktintegration implementiert. `src/server/export/passar/` definiert ein
`DeclarationExportAdapter`-Interface; die erste Implementierung erzeugt einen neutralen,
versionierten JSON-Datensatz. Eine echte Anbindung erfolgt erst nach Prüfung der offiziellen
BAZG-Schnittstellendokumentation und Tests in der Abnahmeumgebung.

## Authentifizierung & Berechtigungen (Phase 3)

- Login: E-Mail + Passwort, konstante Laufzeit auch bei unbekanntem Benutzer, einheitliche Fehlermeldung.
- Rate-Limit: 5 Versuche / 15 min je E-Mail+IP (im Prozessspeicher; bei mehreren Instanzen → DB/Redis, Phase 8).
- Session: 256-Bit-Zufallstoken im httpOnly/SameSite=Lax/Secure-Cookie; in der DB nur SHA-256-Hash. Laufzeit 10 h.
- Jede Anfrage prüft: Session gültig, Benutzer aktiv, Mitgliedschaft im Session-Mandanten vorhanden → Entzug wirkt sofort.
- Rollenmatrix: `src/server/auth/permissions.ts` (getestet). Seiten: `requireCan` → Hinweisseite; Actions: `assertCan`.
- Fachliche Ablehnungen (z. B. letzter Admin, offene kritische Befunde) werden als Rückgabewert inline angezeigt.
- Audit: LOGIN, LOGIN_FAILED, CREATE/UPDATE (feldgenau)/DELETE, STATUS, ROLE_CHANGED, MEMBER_ADDED/REMOVED, AI_CONSENT_*, PASSWORD_CHANGED.

## Belege & Import (Phase 4)

- **Upload:** eine Datei pro Anfrage (Client lädt bis zu 3 parallel, Fortschritt je Datei), max. 4 MB
  (Vercel-Limit 4.5 MB/Anfrage; grössere Scans später per Direkt-Upload in Objektspeicher).
- **Typprüfung:** Magic Bytes statt Dateiendung/MIME; erlaubt PDF, PNG, JPEG, XLSX (nur .xlsx, keine Makros), CSV.
  Ausgeliefert wird mit dem geprüften Typ + `nosniff`; Nicht-PDFs zusätzlich mit Sandbox-CSP.
- **Ablage:** AES-256-GCM, 12-Byte-Zufalls-IV je Datei, AAD = Mandant:Dokument (Chiffrat ist an Mandant gebunden),
  `keyId` für Rotation. Speicherort vorerst PostgreSQL (`StoredFile`, bytea) → keine Zusatzinfrastruktur;
  Adapter für S3-kompatiblen CH-Speicher folgt bei grösseren Volumen.
- **Duplikate:** SHA-256 je Mandant – gleiche Datei im selben Auftrag wird abgewiesen, in anderem Auftrag markiert.
- **PDF:** nur Textlayer (unpdf), keine KI. Kopfdaten (Nr., Datum, Währung, Total) als Vorschlag mit Seite + Textausschnitt,
  Rechnung im Status „zu prüfen“. Scans/Bilder warten auf OCR/KI (Phase 5, nur mit KI-Freigabe).
- **Excel/CSV:** Trennzeichen- und Kopfzeilenerkennung, Synonym-Zuordnung DE/EN/FR/IT, Dezimal-Konvention je Datei,
  Summenzeilen werden erkannt (Total übernommen, nicht berechnet). Jede Position speichert Blatt + Zeilennummer + Rohwerte.
- **Rundung:** Positionen einzeln auf 0.01; Total = Summe der Positionen; Differenz zum exakten Total wird angezeigt (Frage F10).

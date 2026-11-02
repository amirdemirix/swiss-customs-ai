# Swiss Customs AI

Verzollungsvorbereitung für Schweizer Zollagenturen: viele Handelsrechnungen → geprüfte,
nachvollziehbare Anmeldepositionen (Tarifnummer / Ursprung / Präferenz / Verfahren …).

> **Status:** Phase 1–9 umgesetzt (Testumgebung). Betrieb: `docs/04-betrieb.md`, Datenschutz: `docs/05-datenschutz.md`. Keine Passar-Direktintegration. KI-Tarifvorschläge sind nie
> eine bestätigte Tarifeinreihung. Alle Testdaten sind synthetisch.

## Schnellstart (lokal)

```bash
npm install
docker compose up -d          # oder eigene PostgreSQL 16-Instanz
cp .env.example .env          # DATABASE_URL anpassen, FILE_ENCRYPTION_KEY setzen: openssl rand -base64 32
npx prisma migrate deploy
npm run db:seed               # synthetische Daten: 2 Mandanten, 37 Rechnungen, 654 Positionen
npm run dev                   # http://localhost:3000
```

Demo-Zugänge (synthetisch), Passwort jeweils `Demo-Passwort-2026!`:

| E-Mail | Rolle |
|---|---|
| admin@example.ch | Administrator |
| deklarant@example.ch | Zolldeklarant |
| pruefer@example.ch | Prüfer |
| leser@example.ch | Nur Lesen |

`next start` setzt Session-Cookies mit `Secure` (HTTPS nötig; `localhost` ist ausgenommen).
Für Tests über HTTP auf einem anderen Host: `INSECURE_COOKIES=true` (nie in Produktion).

## Befehle

| Befehl | Zweck |
|---|---|
| `npm test` | Unit- und Integrationstests (Integration benötigt DB) |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run build` | Produktionsbuild |
| `npm run db:migrate` | Neue Migration erstellen |
| `npm run samples` | Synthetische Beispielrechnungen (CSV/XLSX/PDF) nach `public/beispiele/` erzeugen |

## Struktur

```
docs/                 Fachanalyse, Architektur, Entwicklungsplan, offene Fragen
prisma/               Datenmodell, Migrationen, synthetischer Seed
src/domain/           Reine Fachlogik (Geld, Tarif, Gruppierung, Prüfregeln) – framework-frei
src/server/           DB-Zugriff mit Mandanten-Guard, Kontext/Rollen, Services
src/app/              Next.js-Oberfläche
tests/                Vitest (domain + integration)
```

## Grundsätze

- Geldbeträge: `decimal.js` / Postgres `NUMERIC`, Rundung erst auf Anmeldeposition (HALF_UP).
- Gruppierung nur bei voller Übereinstimmung aller Merkmale des Gruppierungsprofils;
  fehlende/ungültige Pflichtmerkmale → keine Zusammenfassung.
- Gewichte werden nie geschätzt oder verteilt; fehlt eines, bleibt das Total leer.
- Jede Anmeldeposition verweist auf alle Ursprungspositionen (`DeclarationLineSource`).
- Jeder DB-Zugriff aus der App läuft über `tenantDb(tenantId)` (Test prüft Vollständigkeit).

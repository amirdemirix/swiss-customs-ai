# 04 – Betrieb & Bereitstellung

## Umgebungsvariablen

| Variable | Pflicht | Zweck |
|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL (gepoolt, z. B. Neon) |
| `DATABASE_URL_UNPOOLED` | ja | Direkte Verbindung für Migrationen |
| `FILE_ENCRYPTION_KEY` | ja | 32 Byte base64 (`openssl rand -base64 32`) – AES-256-GCM für Belege. **Verlust = Belege unlesbar.** In einem Passwort-Tresor sichern. |
| `FILE_ENCRYPTION_KEY_ID` / `FILE_ENCRYPTION_KEY_<ID>` | nein | Schlüsselrotation (siehe unten) |
| `CRON_SECRET` | empfohlen | Schützt `/api/cron/retention` |
| `ANTHROPIC_API_KEY` | nein | Aktiviert die KI-Erkennung (zusätzlich KI-Freigabe je Mandant nötig) |
| `EXTRACTION_MODEL` | nein | Standard `claude-opus-5-5` |
| `MAX_UPLOAD_BYTES` | nein | Standard 4 MB (Vercel-Limit 4.5 MB je Anfrage) |

## Variante A – Vercel + Neon (aktuelle Testumgebung)

- Build-Befehl `npm run vercel-build`: `prisma migrate deploy` → Seed nur, wenn Demo-Mandant fehlt → `next build`.
- Region Functions `fra1`; Neon-Region `aws-eu-central-1`. **Keine Datenhaltung in der Schweiz.**
- Cron: `vercel.json` ruft täglich `/api/cron/retention` auf (Vercel sendet `Authorization: Bearer $CRON_SECRET`).
- Vercel blockiert Builds mit bekannten Next.js-Sicherheitslücken – Abhängigkeiten aktuell halten.

## Variante B – Docker (Self-Hosting, z. B. Rechenzentrum in der Schweiz)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`.env.production` enthält mindestens `POSTGRES_PASSWORD`, `FILE_ENCRYPTION_KEY`, `CRON_SECRET`.
Migrationen laufen beim Start. TLS über vorgelagerten Reverse-Proxy (z. B. Caddy/Traefik); Session-Cookies sind `Secure`.
Cron für Aufbewahrung: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/retention` täglich.
Demo-Daten (nur Test!): `docker compose exec app node -e "…"` bzw. lokal `npm run db:seed` gegen die Test-DB.

## Backup & Wiederherstellung

- **Neon:** Point-in-Time-Restore gemäss Plan (Free: kurze Historie) – für Produktion bezahlten Plan mit ≥ 7 Tagen wählen.
- **Self-Hosting:** täglich `pg_dump -Fc swiss_customs > backup-$(date +%F).dump`, verschlüsselt und ausser Haus aufbewahren;
  Wiederherstellung `pg_restore -d swiss_customs backup.dump`. Belege liegen verschlüsselt in der DB – Backup enthält sie,
  ist aber **ohne FILE_ENCRYPTION_KEY unlesbar** → Schlüssel getrennt sichern.
- Wiederherstellung quartalsweise testen.

## Schlüsselrotation

1. `openssl rand -base64 32` → neuer Schlüssel.
2. Setzen: `FILE_ENCRYPTION_KEY_ID=v2`, `FILE_ENCRYPTION_KEY=<neu>`, `FILE_ENCRYPTION_KEY_V1=<alt>`; neu deployen.
3. `npx tsx scripts/rotate-file-key.ts` (mit denselben Variablen) verschlüsselt alle Belege um.
4. `FILE_ENCRYPTION_KEY_V1` entfernen.

> Der Schlüssel der Testumgebung wurde während der Entwicklung im Chat-Verlauf sichtbar. **Vor echten Daten rotieren.**

## Überwachung

- Vercel: Runtime-Logs / Fehler (Hobby-Plan hält Logs nur 1 h – für Produktion Pro-Plan oder Log-Drain).
- Fachlich: Audit-Protokoll unter *Einstellungen → Audit-Protokoll* (Logins, Fehlversuche, KI-Übermittlungen, Exporte, Löschungen).

## Bekannte Punkte

- `npm audit`: Meldungen in Build-Werkzeugen (Prisma CLI `deepmerge-ts`/`effect`) und exceljs-Abhängigkeiten
  (`minimatch`, veraltete `glob`/`uuid`). Keine davon verarbeitet Benutzereingaben im Laufzeitpfad; Update auf Prisma 7
  und Ersatz/Update von exceljs einplanen.
- CSP erlaubt `'unsafe-inline'` für Skripte (Next.js-Bootstrap). Verschärfung mit Nonces möglich.
- Mandantentrennung erfolgt in der Anwendung (Prisma-Guard + Tests). Zusätzliche Postgres Row-Level-Security ist eine
  sinnvolle zweite Verteidigungslinie vor Produktivbetrieb mit mehreren Agenturen.
- KI-Erkennung läuft synchron (max. 300 s). Für sehr grosse Rechnungen später Job-Queue (`ProcessingJob` vorhanden).

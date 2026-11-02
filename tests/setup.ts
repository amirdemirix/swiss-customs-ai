import { randomBytes } from "node:crypto";
// Testschlüssel (nie produktiv): Belegverschlüsselung in Integrationstests
process.env.FILE_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");

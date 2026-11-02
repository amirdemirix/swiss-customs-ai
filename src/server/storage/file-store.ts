import type { TenantDb } from "../tenant-db";
import { decrypt, encrypt } from "./crypto";

/**
 * Ablage verschlüsselter Belege in PostgreSQL (bytea). Für den Start ausreichend und ohne
 * zusätzliche Infrastruktur; für grosse Volumen später S3-kompatibler CH-Speicher
 * (gleiche Schnittstelle, storageKey-Präfix "s3:").
 */
const aad = (tenantId: string, documentId: string) => `${tenantId}:${documentId}`;

export async function storeFile(db: TenantDb, tenantId: string, documentId: string, data: Buffer) {
  const e = encrypt(data, aad(tenantId, documentId));
  const f = await db.storedFile.create({
    data: { tenantId, documentId, keyId: e.keyId, iv: e.iv, authTag: e.authTag, ciphertext: e.ciphertext },
  });
  return `db:${f.id}`;
}

export async function readFile(db: TenantDb, tenantId: string, documentId: string): Promise<Buffer | null> {
  const f = await db.storedFile.findFirst({ where: { documentId } });
  if (!f) return null;
  return decrypt({ keyId: f.keyId, iv: f.iv, authTag: f.authTag, ciphertext: Buffer.from(f.ciphertext) }, aad(tenantId, documentId));
}

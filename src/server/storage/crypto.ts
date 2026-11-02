import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM für Belege. Schlüssel: FILE_ENCRYPTION_KEY (32 Byte, base64).
 * GCM liefert Vertraulichkeit + Integrität: manipulierte Daten lassen sich nicht entschlüsseln.
 * keyId ermöglicht spätere Schlüsselrotation (FILE_ENCRYPTION_KEY_<ID>).
 */
export const CURRENT_KEY_ID = "v1";

export class MissingKeyError extends Error {}

function getKey(keyId: string): Buffer {
  const raw = keyId === CURRENT_KEY_ID ? process.env.FILE_ENCRYPTION_KEY : process.env[`FILE_ENCRYPTION_KEY_${keyId.toUpperCase()}`];
  if (!raw) throw new MissingKeyError(`Verschlüsselungsschlüssel ${keyId} fehlt (FILE_ENCRYPTION_KEY).`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new MissingKeyError("FILE_ENCRYPTION_KEY muss 32 Byte (base64) lang sein.");
  return key;
}

export interface Encrypted { keyId: string; iv: string; authTag: string; ciphertext: Buffer }

/** aad = Mandant + Dokument: verhindert, dass ein Chiffrat einem anderen Dokument untergeschoben wird. */
export function encrypt(plain: Buffer, aad: string): Encrypted {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", getKey(CURRENT_KEY_ID), iv);
  c.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([c.update(plain), c.final()]);
  return { keyId: CURRENT_KEY_ID, iv: iv.toString("base64"), authTag: c.getAuthTag().toString("base64"), ciphertext };
}

export function decrypt(e: Encrypted, aad: string): Buffer {
  const d = createDecipheriv("aes-256-gcm", getKey(e.keyId), Buffer.from(e.iv, "base64"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(e.authTag, "base64"));
  return Buffer.concat([d.update(e.ciphertext), d.final()]);
}

export const sha256 = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

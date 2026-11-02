/**
 * Schlüsselrotation für Belege.
 * 1. Neuen Schlüssel erzeugen: openssl rand -base64 32
 * 2. Umgebung: FILE_ENCRYPTION_KEY_ID=v2, FILE_ENCRYPTION_KEY=<neu>, FILE_ENCRYPTION_KEY_V1=<alt>
 * 3. npx tsx scripts/rotate-file-key.ts   → verschlüsselt alle Belege mit dem neuen Schlüssel um
 * 4. Danach FILE_ENCRYPTION_KEY_V1 entfernen.
 */
import { PrismaClient } from "@prisma/client";
import { currentKeyId, decrypt, encrypt } from "../src/server/storage/crypto";

const prisma = new PrismaClient();
async function main() {
  const target = currentKeyId();
  let n = 0;
  for (;;) {
    const batch = await prisma.storedFile.findMany({ where: { keyId: { not: target } }, take: 100 });
    if (!batch.length) break;
    for (const f of batch) {
      const aad = `${f.tenantId}:${f.documentId}`;
      const plain = decrypt({ keyId: f.keyId, iv: f.iv, authTag: f.authTag, ciphertext: Buffer.from(f.ciphertext) }, aad);
      const e = encrypt(plain, aad);
      await prisma.storedFile.update({ where: { id: f.id }, data: { keyId: e.keyId, iv: e.iv, authTag: e.authTag, ciphertext: e.ciphertext } });
      n++;
    }
  }
  console.log(`${n} Belege auf Schlüssel ${target} umgeschlüsselt.`);
}
main().finally(() => prisma.$disconnect());

import { describe, expect, it } from "vitest";
import { decrypt, encrypt, MissingKeyError, sha256 } from "@/server/storage/crypto";

describe("Belegverschlüsselung (AES-256-GCM)", () => {
  const plain = Buffer.from("Rechnung R-1 · CHF 1'400.00 · vertraulich");
  it("ver- und entschlüsselt verlustfrei, Chiffrat enthält keinen Klartext", () => {
    const e = encrypt(plain, "t1:d1");
    expect(e.ciphertext.includes(Buffer.from("vertraulich"))).toBe(false);
    expect(decrypt(e, "t1:d1").equals(plain)).toBe(true);
  });
  it("verwendet für jede Datei einen neuen IV", () => {
    expect(encrypt(plain, "a").iv).not.toBe(encrypt(plain, "a").iv);
  });
  it("erkennt Manipulation", () => {
    const e = encrypt(plain, "t1:d1");
    e.ciphertext[0] ^= 0xff;
    expect(() => decrypt(e, "t1:d1")).toThrow();
  });
  it("verhindert Zuordnung zu anderem Mandanten/Dokument", () => {
    const e = encrypt(plain, "t1:d1");
    expect(() => decrypt(e, "t2:d1")).toThrow();
  });
  it("ohne Schlüssel kein Betrieb", () => {
    const k = process.env.FILE_ENCRYPTION_KEY;
    delete process.env.FILE_ENCRYPTION_KEY;
    try { expect(() => encrypt(plain, "x")).toThrow(MissingKeyError); } finally { process.env.FILE_ENCRYPTION_KEY = k; }
  });
  it("SHA-256 für Duplikaterkennung", () => {
    expect(sha256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

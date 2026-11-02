import bcrypt from "bcryptjs";

const COST = 12;
export const hashPassword = (pw: string) => bcrypt.hash(pw, COST);
export const verifyPassword = (pw: string, hash: string | null | undefined) => (hash ? bcrypt.compare(pw, hash) : Promise.resolve(false));

/** Passwortrichtlinie: min. 12 Zeichen, Gross-/Kleinbuchstaben, Ziffer. */
export function checkPasswordPolicy(pw: string): string[] {
  const e: string[] = [];
  if (pw.length < 12) e.push("Mindestens 12 Zeichen");
  if (pw.length > 200) e.push("Maximal 200 Zeichen");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) e.push("Gross- und Kleinbuchstaben");
  if (!/\d/.test(pw)) e.push("Mindestens eine Ziffer");
  return e;
}

/** Konstante Laufzeit auch bei unbekanntem Benutzer (verhindert User-Enumeration über Timing). */
let dummyHash: Promise<string> | null = null;
export const verifyPasswordConstantTime = async (pw: string, hash: string | null | undefined) => {
  dummyHash ??= bcrypt.hash("timing-dummy", COST);
  const ok = await bcrypt.compare(pw, hash ?? (await dummyHash));
  return hash ? ok : false;
};

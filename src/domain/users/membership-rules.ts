export type Role = "ADMIN" | "DECLARANT" | "REVIEWER" | "READ_ONLY";

/**
 * Schützt vor Aussperrung: Der letzte Administrator eines Mandanten kann weder herabgestuft
 * noch entfernt werden; Administratoren können sich nicht selbst herabstufen oder entfernen.
 */
export function checkMembershipChange(input: {
  actorUserId: string;
  targetUserId: string;
  targetCurrentRole: Role;
  newRole: Role | null; // null = entfernen
  adminCount: number;
}): { ok: true } | { ok: false; reason: string } {
  const { actorUserId, targetUserId, targetCurrentRole, newRole, adminCount } = input;
  if (actorUserId === targetUserId && newRole === null) return { ok: false, reason: "Sie können sich nicht selbst entfernen." };
  const demotesAdmin = targetCurrentRole === "ADMIN" && newRole !== "ADMIN";
  if (actorUserId === targetUserId && demotesAdmin) return { ok: false, reason: "Sie können Ihre eigene Administratorrolle nicht entfernen." };
  if (demotesAdmin && adminCount <= 1) return { ok: false, reason: "Der letzte Administrator kann nicht entfernt oder herabgestuft werden." };
  return { ok: true };
}

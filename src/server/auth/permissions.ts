import type { Role } from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrator", DECLARANT: "Zolldeklarant", REVIEWER: "Prüfer", READ_ONLY: "Nur Lesen" };

export const PERMISSIONS = {
  "order.write": ["ADMIN", "DECLARANT"],
  "order.delete": ["ADMIN"],
  "customer.write": ["ADMIN", "DECLARANT"],
  "invoice.edit": ["ADMIN", "DECLARANT", "REVIEWER"],
  "document.upload": ["ADMIN", "DECLARANT"],
  "document.delete": ["ADMIN", "DECLARANT"],
  "tariff.confirm": ["ADMIN", "DECLARANT", "REVIEWER"],
  "export.create": ["ADMIN", "DECLARANT"],
  "settings.manage": ["ADMIN"],
  "users.manage": ["ADMIN"],
  "audit.read": ["ADMIN", "REVIEWER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;
export const can = (role: Role, p: Permission) => (PERMISSIONS[p] as readonly Role[]).includes(role);

export class ForbiddenError extends Error {
  constructor(public permission: Permission) { super(`Keine Berechtigung: ${permission}`); }
}

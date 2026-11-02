import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
/** Roh-Client. NUR für mandantenübergreifende Systemaufgaben (Auth, Worker-Locking) verwenden. */
export const prismaRoot = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = prismaRoot;

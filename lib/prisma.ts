import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient singleton. Next.js dev mode re-evaluates modules on hot reload,
 * which would otherwise create a new pool on every change and exhaust
 * connections. Reuse a global instance outside production.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

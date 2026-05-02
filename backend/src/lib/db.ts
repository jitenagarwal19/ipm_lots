import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client. Wrapped in a mutable object so tests can replace `db.prisma`
 * with a mock without reloading route modules.
 */
export const db = {
  prisma: new PrismaClient(),
};

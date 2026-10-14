import { PrismaClient } from "@prisma/client";

// Singleton: evita abrir múltiples conexiones con el hot-reload de Next en desarrollo.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

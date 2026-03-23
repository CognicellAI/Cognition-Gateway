import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function getAdapterParams(): { url: string } {
  const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  // PrismaBetterSqlite3 expects the raw file: URL or :memory:
  return { url: raw };
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3(getAdapterParams());

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

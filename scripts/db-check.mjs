// Dev utility: verify Prisma Client can reach the database via DATABASE_URL.
// Run with: npm run db:check  (loads .env.local through dotenv-cli)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const rows = await prisma.$queryRaw`select 1 as ok`;
  console.log("DB_OK", JSON.stringify(rows));
} catch (e) {
  console.log(
    "DB_ERR",
    e?.constructor?.name ?? "Error",
    e?.code ?? "",
    String(e?.message ?? "").split("\n")[0],
  );
} finally {
  await prisma.$disconnect();
}

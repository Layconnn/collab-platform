import createJiti from "jiti";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DECISION_TEST_DATABASE_URL;

const jiti = createJiti(import.meta.url);
const { decisionService } = jiti("../services/decision.service.ts");
const { prisma } = jiti("../db/prisma.ts");

try {
  await decisionService.supersede(process.argv[2], JSON.parse(process.argv[3]));
  process.stdout.write("OK\n");
} catch (error) {
  process.stdout.write(`${error.code ?? "UNKNOWN"}\n`);
} finally {
  await prisma.$disconnect();
}

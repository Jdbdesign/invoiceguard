import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [clients, invoices, paymentPlans, installments, activityLogs, settings] =
    await Promise.all([
      prisma.client.findMany(),
      prisma.invoice.findMany(),
      prisma.paymentPlan.findMany(),
      prisma.installment.findMany(),
      prisma.activityLog.findMany(),
      prisma.settings.findMany(),
    ]);

  const snapshot = {
    takenAt: new Date().toISOString(),
    databaseUrlHost: new URL(process.env.DATABASE_URL ?? "").hostname,
    clients,
    invoices,
    paymentPlans,
    installments,
    activityLogs,
    settings,
  };

  const filename = `backup-${Date.now()}.json`;
  writeFileSync(filename, JSON.stringify(snapshot, null, 2));

  console.log(`Wrote backup to ${filename}`);
  console.log({
    clients: clients.length,
    invoices: invoices.length,
    paymentPlans: paymentPlans.length,
    installments: installments.length,
    activityLogs: activityLogs.length,
    settings: settings.length,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

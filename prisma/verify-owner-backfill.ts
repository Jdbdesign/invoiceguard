import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const totalClients = await prisma.client.count();
  const orphanedClients = await prisma.client.count({ where: { ownerId: null } });
  const totalSettings = await prisma.settings.count();
  const orphanedSettings = await prisma.settings.count({ where: { ownerId: null } });

  const sample = await prisma.client.findMany({
    take: 5,
    include: { owner: true, invoices: { take: 1, select: { invoiceNumber: true } } },
  });

  console.log({ totalClients, orphanedClients, totalSettings, orphanedSettings });
  console.log(
    "Sample ownership check:",
    sample.map((c) => ({
      client: c.name,
      owner: c.owner?.email ?? "MISSING OWNER",
      sampleInvoice: c.invoices[0]?.invoiceNumber ?? "(no invoices)",
    }))
  );

  if (orphanedClients > 0 || orphanedSettings > 0) {
    throw new Error(
      `Verification FAILED: ${orphanedClients} orphaned Client row(s), ${orphanedSettings} orphaned Settings row(s). Do not run the NOT NULL migration yet.`
    );
  }

  console.log("Verification passed — every Client and Settings row has an owner. Safe to proceed to the NOT NULL migration.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

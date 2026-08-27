import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = (process.env.DEFAULT_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Set DEFAULT_OWNER_EMAIL before running this script");
  }

  const passwordProvided = Boolean(process.env.DEFAULT_OWNER_PASSWORD);
  const password = process.env.DEFAULT_OWNER_PASSWORD ?? randomBytes(9).toString("base64url");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({ data: { email, passwordHash } });
    console.log(`Created default user ${email} (id ${user.id})`);
    if (!passwordProvided) {
      console.log(`Generated temporary password: ${password}`);
      console.log("Record this now — it is not stored anywhere else.");
    }
  } else {
    console.log(`Default user ${email} already exists (id ${user.id}) — reusing it, password unchanged`);
  }

  const clientResult = await prisma.client.updateMany({
    // @ts-expect-error — intentionally querying the pre-migration nullable ownerId state; this script only runs before the NOT NULL migration is applied.
    where: { ownerId: null },
    data: { ownerId: user.id },
  });
  console.log(`Backfilled ownerId on ${clientResult.count} Client row(s)`);

  const ownedSettings = await prisma.settings.findUnique({ where: { ownerId: user.id } });
  // @ts-expect-error — intentionally querying the pre-migration nullable ownerId state; this script only runs before the NOT NULL migration is applied.
  const globalSettings = await prisma.settings.findMany({ where: { ownerId: null } });

  if (!ownedSettings) {
    await prisma.settings.create({
      data: {
        ownerId: user.id,
        friendlyReminderDays: globalSettings[0]?.friendlyReminderDays ?? 3,
        firmReminderDays: globalSettings[0]?.firmReminderDays ?? 15,
        finalNoticeDays: globalSettings[0]?.finalNoticeDays ?? 45,
      },
    });
    console.log("Created Settings row for default user");
  } else {
    console.log("Default user already has a Settings row — leaving it as-is");
  }

  if (globalSettings.length > 0) {
    if (globalSettings.length > 1) {
      console.warn(
        `WARNING: Found ${globalSettings.length} orphaned global Settings rows. ` +
        `Migrating values from the first row and deleting all of them.`
      );
    }
    // @ts-expect-error — intentionally querying the pre-migration nullable ownerId state; this script only runs before the NOT NULL migration is applied.
    await prisma.settings.deleteMany({ where: { ownerId: null } });
    console.log(`Removed ${globalSettings.length} old global Settings row(s)`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

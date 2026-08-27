import { prisma } from "./db";

export async function getOrCreateSettings(ownerId: string) {
  const existing = await prisma.settings.findUnique({ where: { ownerId } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      ownerId,
      friendlyReminderDays: 3,
      firmReminderDays: 15,
      finalNoticeDays: 45,
    },
  });
}

import { prisma } from "./db";
import { PASSWORD_RECONFIRM_DEFAULT_MINUTES } from "./passwordReconfirmBounds";

export async function getOrCreateSettings(ownerId: string) {
  const existing = await prisma.settings.findUnique({ where: { ownerId } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      ownerId,
      friendlyReminderDays: 3,
      firmReminderDays: 15,
      finalNoticeDays: 45,
      passwordReconfirmMinutes: PASSWORD_RECONFIRM_DEFAULT_MINUTES,
    },
  });
}

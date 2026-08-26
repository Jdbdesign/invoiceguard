import { prisma } from "./db";

const SETTINGS_ID = "settings";

export async function getOrCreateSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      id: SETTINGS_ID,
      friendlyReminderDays: 3,
      firmReminderDays: 15,
      finalNoticeDays: 45,
    },
  });
}

export { SETTINGS_ID };

import type { ReminderSchedule, ReminderStage } from "./types";

/** Which stage applies right now for an invoice this many days past due. */
export function determineReminderStage(
  daysOverdue: number,
  schedule: ReminderSchedule
): ReminderStage {
  if (daysOverdue >= schedule.finalDays) return "final";
  if (daysOverdue >= schedule.firmDays) return "firm";
  return "friendly";
}

/** The stage whose threshold an invoice crosses on exactly this day, or null if none. */
export function crossedStageToday(
  daysOverdue: number,
  schedule: ReminderSchedule
): ReminderStage | null {
  if (daysOverdue === schedule.finalDays) return "final";
  if (daysOverdue === schedule.firmDays) return "firm";
  if (daysOverdue === schedule.friendlyDays) return "friendly";
  return null;
}

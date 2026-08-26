import { fromIsoDate, toIsoDate } from "./dateSerialization";

export type PaymentPlanFrequency = "weekly" | "biweekly" | "monthly";

export const FREQUENCIES: { value: PaymentPlanFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
];

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 12;
export const DEFAULT_INSTALLMENTS = 4;

export function isValidInstallmentCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_INSTALLMENTS && n <= MAX_INSTALLMENTS;
}

export function isValidFrequency(value: string): value is PaymentPlanFrequency {
  return value === "weekly" || value === "biweekly" || value === "monthly";
}

export interface InstallmentPreview {
  amount: number;
  dueDate: string;
}

/** Steps a UTC date forward by whole months, clamping the day-of-month to
 * the target month's last day (Jan 31 + 1 month -> Feb 28/29, not the
 * "March 3" native Date rollover would otherwise produce). */
function addMonthsClamped(date: Date, months: number): Date {
  const targetIndex = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfMonth)));
}

function installmentDueDate(
  firstDueDateIso: string,
  index: number,
  frequency: PaymentPlanFrequency
): string {
  const date = fromIsoDate(firstDueDateIso);
  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7 * index);
    return toIsoDate(date);
  }
  if (frequency === "biweekly") {
    date.setUTCDate(date.getUTCDate() + 14 * index);
    return toIsoDate(date);
  }
  return toIsoDate(addMonthsClamped(date, index));
}

/** Splits `remainingBalance` into `count` installments, computed in integer
 * cents so the last installment absorbs the exact rounding remainder and
 * the sum always equals `remainingBalance` to the cent. */
export function computeInstallmentSchedule(
  remainingBalance: number,
  count: number,
  firstDueDateIso: string,
  frequency: PaymentPlanFrequency
): InstallmentPreview[] {
  const totalCents = Math.round(remainingBalance * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainderCents = totalCents - baseCents * count;

  return Array.from({ length: count }, (_, index) => {
    const isLast = index === count - 1;
    const cents = isLast ? baseCents + remainderCents : baseCents;
    return {
      amount: cents / 100,
      dueDate: installmentDueDate(firstDueDateIso, index, frequency),
    };
  });
}

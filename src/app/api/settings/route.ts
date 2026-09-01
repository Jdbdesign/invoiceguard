import { NextResponse } from "next/server";
import { mapSettings } from "@/lib/mappers";
import { getOrCreateSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  PASSWORD_RECONFIRM_MIN_MINUTES,
  PASSWORD_RECONFIRM_MAX_MINUTES,
} from "@/lib/passwordReconfirmBounds";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getOrCreateSettings(session.user.id);
  return NextResponse.json(mapSettings(settings));
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const data: {
    friendlyReminderDays?: number;
    firmReminderDays?: number;
    finalNoticeDays?: number;
    passwordReconfirmMinutes?: number;
  } = {};

  const hasSchedule =
    body.friendlyDays !== undefined ||
    body.firmDays !== undefined ||
    body.finalDays !== undefined;

  if (hasSchedule) {
    const friendlyDays = Number(body.friendlyDays);
    const firmDays = Number(body.firmDays);
    const finalDays = Number(body.finalDays);

    if (
      !Number.isFinite(friendlyDays) ||
      !Number.isFinite(firmDays) ||
      !Number.isFinite(finalDays) ||
      friendlyDays < 0 ||
      firmDays < 0 ||
      finalDays < 0
    ) {
      return NextResponse.json({ error: "invalid schedule" }, { status: 400 });
    }

    data.friendlyReminderDays = friendlyDays;
    data.firmReminderDays = firmDays;
    data.finalNoticeDays = finalDays;
  }

  if (body.passwordReconfirmMinutes !== undefined) {
    const passwordReconfirmMinutes = Number(body.passwordReconfirmMinutes);

    if (
      !Number.isInteger(passwordReconfirmMinutes) ||
      passwordReconfirmMinutes < PASSWORD_RECONFIRM_MIN_MINUTES ||
      passwordReconfirmMinutes > PASSWORD_RECONFIRM_MAX_MINUTES
    ) {
      return NextResponse.json(
        {
          error: `passwordReconfirmMinutes must be an integer between ${PASSWORD_RECONFIRM_MIN_MINUTES} and ${PASSWORD_RECONFIRM_MAX_MINUTES}`,
        },
        { status: 400 }
      );
    }

    data.passwordReconfirmMinutes = passwordReconfirmMinutes;
  }

  await getOrCreateSettings(session.user.id);

  const updated = await prisma.settings.update({
    where: { ownerId: session.user.id },
    data,
  });

  return NextResponse.json(mapSettings(updated));
}

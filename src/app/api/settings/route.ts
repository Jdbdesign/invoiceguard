import { NextResponse } from "next/server";
import { mapSettings } from "@/lib/mappers";
import { getOrCreateSettings, SETTINGS_ID } from "@/lib/settings";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await getOrCreateSettings();
  return NextResponse.json(mapSettings(settings));
}

export async function PUT(request: Request) {
  const body = await request.json();
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

  await getOrCreateSettings();

  const updated = await prisma.settings.update({
    where: { id: SETTINGS_ID },
    data: {
      friendlyReminderDays: friendlyDays,
      firmReminderDays: firmDays,
      finalNoticeDays: finalDays,
    },
  });

  return NextResponse.json(mapSettings(updated));
}

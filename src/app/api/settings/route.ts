import { NextResponse } from "next/server";
import { mapSettings } from "@/lib/mappers";
import { getOrCreateSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

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

  await getOrCreateSettings(session.user.id);

  const updated = await prisma.settings.update({
    where: { ownerId: session.user.id },
    data: {
      friendlyReminderDays: friendlyDays,
      firmReminderDays: firmDays,
      finalNoticeDays: finalDays,
    },
  });

  return NextResponse.json(mapSettings(updated));
}

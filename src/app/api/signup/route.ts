import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "enter a valid email address" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "an account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  await prisma.settings.create({
    data: {
      ownerId: user.id,
      friendlyReminderDays: 3,
      firmReminderDays: 15,
      finalNoticeDays: 45,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

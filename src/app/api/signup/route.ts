import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const businessName = String(body.businessName ?? "").trim();
  const businessType = String(body.businessType ?? "").trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "enter a valid email address" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }
  if (!businessName) {
    return NextResponse.json({ error: "enter a business name" }, { status: 400 });
  }
  if (!BUSINESS_TYPES.includes(businessType as (typeof BUSINESS_TYPES)[number])) {
    return NextResponse.json({ error: "select a business type" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "an account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      settings: {
        create: {
          friendlyReminderDays: 3,
          firmReminderDays: 15,
          finalNoticeDays: 45,
          businessName,
          businessType,
        },
      },
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

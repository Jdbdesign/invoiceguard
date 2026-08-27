import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issuePasswordResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_MESSAGE = "If that email exists, we've sent a reset link.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const result = await issuePasswordResetToken(user.id);
  if ("rateLimited" in result) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${result.rawToken}`;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] Password reset link for ${email}: ${resetUrl}`);
  }

  await sendPasswordResetEmail(email, resetUrl);

  return NextResponse.json({ message: GENERIC_MESSAGE });
}

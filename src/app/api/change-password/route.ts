import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { passwordValidationError } from "@/lib/passwordValidation";
import {
  isChangePasswordRateLimited,
  recordFailedChangePasswordAttempt,
  clearChangePasswordAttempts,
} from "@/lib/changePasswordRateLimit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!currentPassword) {
    return NextResponse.json({ error: "current password is required" }, { status: 400 });
  }

  const passwordError = passwordValidationError(newPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  if (isChangePasswordRateLimited(session.user.id)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    recordFailedChangePasswordAttempt(session.user.id);
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from your current password" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  clearChangePasswordAttempts(session.user.id);
  return NextResponse.json({ ok: true });
}

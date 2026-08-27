import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { validatePasswordResetToken, consumePasswordResetToken } from "@/lib/passwordReset";

const MIN_PASSWORD_LENGTH = 8;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ valid: false });
  }
  const result = await validatePasswordResetToken(token);
  return NextResponse.json({ valid: result.valid });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!token) {
    return NextResponse.json({ error: "missing reset token" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await consumePasswordResetToken(token, passwordHash);
  if (!result.ok) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}

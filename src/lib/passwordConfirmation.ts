import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "pwd_confirm";
const WINDOW_MS = 20 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to use password re-confirmation.");
  }
  return secret;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

export async function issuePasswordConfirmation(userId: string): Promise<void> {
  const exp = Date.now() + WINDOW_MS;
  const payloadB64 = Buffer.from(JSON.stringify({ sub: userId, exp })).toString("base64url");
  const token = `${payloadB64}.${sign(payloadB64)}`;

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WINDOW_MS / 1000,
  });
}

// The cookie's own maxAge causes the browser to drop it after 20 minutes,
// but that's just a courtesy — `exp` inside the signed payload is what's
// actually checked below, so an attacker replaying a stale cookie value
// can't extend the window by lying about how old it is.
async function hasFreshPasswordConfirmation(userId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let expectedSig: string;
  try {
    expectedSig = sign(payloadB64);
  } catch {
    return false;
  }

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  let payload: { sub?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  if (typeof payload.sub !== "string" || payload.sub !== userId) return false;
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return false;

  return true;
}

/**
 * Call at the top of a gated route handler, after the normal auth() check.
 * Returns a 403 response to return immediately if reconfirmation is needed,
 * or null if the caller may proceed.
 */
export async function requireFreshPasswordConfirmation(
  userId: string
): Promise<NextResponse | null> {
  const ok = await hasFreshPasswordConfirmation(userId);
  if (ok) return null;
  return NextResponse.json(
    {
      error: "Please confirm your password to continue.",
      code: "PASSWORD_CONFIRMATION_REQUIRED",
    },
    { status: 403 }
  );
}

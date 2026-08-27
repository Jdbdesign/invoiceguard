import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 45 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function issuePasswordResetToken(
  userId: string
): Promise<{ rawToken: string } | { rateLimited: true }> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.passwordResetToken.count({
    where: { userId, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { rateLimited: true };
  }

  const rawToken = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return { rawToken };
}

export async function validatePasswordResetToken(
  rawToken: string
): Promise<{ valid: true; userId: string } | { valid: false }> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { valid: false };
  }
  return { valid: true, userId: record.userId };
}

export async function consumePasswordResetToken(
  rawToken: string,
  newPasswordHash: string
): Promise<{ ok: true } | { ok: false }> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false };
  }

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash },
    }),
  ]);

  return { ok: true };
}

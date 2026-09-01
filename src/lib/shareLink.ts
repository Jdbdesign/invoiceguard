import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { ShareLink } from "@prisma/client";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** clientId omitted (or null) creates a whole-clients-list scoped link. */
export async function createShareLink(
  ownerId: string,
  clientId?: string | null
): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  const link = await prisma.shareLink.create({
    data: { ownerId, clientId: clientId ?? null, tokenHash, expiresAt },
  });

  return { id: link.id, rawToken, expiresAt };
}

/** Resolves a raw token to its ShareLink row, or null if it doesn't exist,
 * has been revoked, or has expired. Callers should treat all three cases
 * identically (a generic "not found") rather than distinguishing them, to
 * avoid leaking which case applies to an attacker probing tokens. */
export async function resolveShareLink(rawToken: string): Promise<ShareLink | null> {
  const tokenHash = hashToken(rawToken);
  const link = await prisma.shareLink.findUnique({ where: { tokenHash } });
  if (!link || link.revokedAt || link.expiresAt < new Date()) {
    return null;
  }
  return link;
}

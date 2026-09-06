// In-memory, per-instance only — on Vercel this map is NOT shared across
// serverless invocations. A cold start (or landing on a different warm
// instance) resets a user's count to zero, so this cap is best-effort, not
// a hard guarantee. Accepted for v1 to avoid a schema change; revisit with
// a persisted counter if this route needs a stronger guarantee later.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const failedAttempts = new Map<string, number[]>();

function recentAttempts(userId: string): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return (failedAttempts.get(userId) ?? []).filter((t) => t >= cutoff);
}

export function isChangePasswordRateLimited(userId: string): boolean {
  return recentAttempts(userId).length >= MAX_ATTEMPTS;
}

export function recordFailedChangePasswordAttempt(userId: string): void {
  const attempts = recentAttempts(userId);
  attempts.push(Date.now());
  failedAttempts.set(userId, attempts);
}

export function clearChangePasswordAttempts(userId: string): void {
  failedAttempts.delete(userId);
}

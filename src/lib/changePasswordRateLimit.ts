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

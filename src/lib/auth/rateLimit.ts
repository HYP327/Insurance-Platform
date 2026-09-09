import "server-only";

/**
 * In-memory login attempt limiter — fine for a single-instance MVP deploy.
 * Move to a shared store (e.g. Redis) before running more than one instance,
 * since this state doesn't survive a restart or get shared across processes.
 */
const attemptsByEmail = new Map<string, { count: number; windowStart: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function isLoginRateLimited(email: string): boolean {
  const entry = attemptsByEmail.get(email);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    attemptsByEmail.delete(email);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedLoginAttempt(email: string): void {
  const entry = attemptsByEmail.get(email);
  if (!entry || Date.now() - entry.windowStart > WINDOW_MS) {
    attemptsByEmail.set(email, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

export function clearLoginAttempts(email: string): void {
  attemptsByEmail.delete(email);
}

export function parseRetryAfter(value, nowMs = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null;
}

export function retryDelayMs(attempt, retryAfterMs = null, random = Math.random()) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, 60_000);
  }
  const exponential = Math.min(30_000, 500 * (2 ** Math.max(0, attempt - 1)));
  return Math.round(exponential * (0.75 + Math.max(0, Math.min(1, random)) * 0.5));
}

export function nextCheckAt(delayMs, nowMs = Date.now()) {
  return new Date(nowMs + Math.max(0, delayMs)).toISOString();
}

export function shouldRetryStatus(status) {
  return status === 429 || status === 408 || status >= 500;
}


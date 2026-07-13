/** Server-only helpers for middleware and route handlers. */

export const TOKEN_COOKIE_NAME = "sif_internal_token";
const SESSION_SECONDS = 12 * 60 * 60;

export function getInternalApiKey(): string | null {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  return apiKey || null;
}

export function internalAuthEnabledOnServer(): boolean {
  return Boolean(getInternalApiKey());
}

export function readSessionToken(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  try {
    return decodeURIComponent(cookieValue);
  } catch {
    return cookieValue;
  }
}

export function hasValidSessionCookie(cookieValue: string | undefined): boolean {
  const apiKey = getInternalApiKey();
  if (!apiKey) return true;

  const token = readSessionToken(cookieValue);
  return Boolean(token && token === apiKey);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

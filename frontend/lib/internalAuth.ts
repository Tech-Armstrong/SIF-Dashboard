const TOKEN_STORAGE_KEY = "sif_internal_token";
const SESSION_EVENT = "sif-internal-session";

export function internalToolsEnabledInUi(): boolean {
  return process.env.NEXT_PUBLIC_INTERNAL_TOOLS_ENABLED !== "false";
}

/** Client UI gate — keep in sync with server INTERNAL_API_KEY + NEXT_PUBLIC_INTERNAL_AUTH_ENABLED. */
export function internalAuthRequired(): boolean {
  return process.env.NEXT_PUBLIC_INTERNAL_AUTH_ENABLED === "true";
}

export function getInternalToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function hasInternalSession(): boolean {
  if (typeof window === "undefined") return false;

  const token = getInternalToken();
  return Boolean(token && token !== "dev");
}

function notifySessionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function setInternalSession(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  notifySessionChange();
}

export function clearInternalSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  notifySessionChange();
}

export function onInternalSessionChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = () => listener();
  window.addEventListener(SESSION_EVENT, handler);
  return () => window.removeEventListener(SESSION_EVENT, handler);
}

export function internalAuthHeaders(): HeadersInit {
  const token = getInternalToken();
  if (!token || token === "dev") return {};
  return { Authorization: `Bearer ${token}` };
}

export async function fetchInternalSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/internal/session", { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

export async function loginInternal(password: string): Promise<void> {
  const res = await fetch("/api/internal/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    authDisabled?: boolean;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || "Invalid password.");
  }

  if (data.authDisabled) {
    setInternalSession("dev");
    return;
  }

  if (!data.token) {
    throw new Error("Login failed.");
  }

  setInternalSession(data.token);
}

export async function logoutInternal(): Promise<void> {
  clearInternalSession();
  try {
    await fetch("/api/internal/logout", { method: "POST" });
  } catch {
    // Best-effort cookie clear on the server.
  }
}

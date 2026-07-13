import { NextRequest, NextResponse } from "next/server";
import {
  getInternalApiKey,
  sessionCookieOptions,
  TOKEN_COOKIE_NAME,
} from "@/lib/internalServer";

export async function POST(request: NextRequest) {
  const apiKey = getInternalApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: true, authDisabled: true });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
  const backendRes = await fetch(`${apiBase}/api/internal/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    cache: "no-store",
  });

  if (!backendRes.ok) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const data = (await backendRes.json()) as { token?: string; authDisabled?: boolean };
  if (data.authDisabled) {
    if (apiKey) {
      return NextResponse.json(
        { error: "Backend internal auth is not configured. Set INTERNAL_PASSWORD and INTERNAL_API_KEY in backend/.env." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, authDisabled: true, token: "dev" });
  }

  if (!data.token || data.token !== apiKey) {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, token: apiKey });
  response.cookies.set(TOKEN_COOKIE_NAME, apiKey, sessionCookieOptions());
  return response;
}

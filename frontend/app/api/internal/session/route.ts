import { NextRequest, NextResponse } from "next/server";
import { hasValidSessionCookie, TOKEN_COOKIE_NAME } from "@/lib/internalServer";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  const authenticated = hasValidSessionCookie(token);
  return NextResponse.json({ authenticated });
}

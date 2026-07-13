import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getInternalApiKey,
  hasValidSessionCookie,
  TOKEN_COOKIE_NAME,
} from "@/lib/internalServer";

const LOGIN_PATH = "/internal/login";

export function middleware(request: NextRequest) {
  if (!getInternalApiKey()) {
    return NextResponse.next();
  }

  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  if (hasValidSessionCookie(token)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/screener", "/portfolio/create"],
};

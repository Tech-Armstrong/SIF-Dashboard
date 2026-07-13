const INTERNAL_ROUTES = ["/screener", "/portfolio/create"] as const;

export type InternalRoute = (typeof INTERNAL_ROUTES)[number];

export const DEFAULT_INTERNAL_ROUTE: InternalRoute = "/screener";

/** Only allow known internal paths after login (blocks open redirects). */
export function resolveInternalNextPath(next: string | null | undefined): InternalRoute {
  if (next && INTERNAL_ROUTES.includes(next as InternalRoute)) {
    return next as InternalRoute;
  }
  return DEFAULT_INTERNAL_ROUTE;
}

export function isInternalProtectedPath(pathname: string): boolean {
  return INTERNAL_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { resolveInternalNextPath } from "@/lib/internalPaths";
import {
  fetchInternalSession,
  hasInternalSession,
  loginInternal,
} from "@/lib/internalAuth";

function InternalLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => resolveInternalNextPath(searchParams.get("next")),
    [searchParams],
  );

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const authenticated = await fetchInternalSession();
      if (cancelled) return;

      if (authenticated) {
        router.replace(nextPath);
        return;
      }

      setMounted(true);
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginInternal(password);

      const authenticated = await fetchInternalSession();
      if (!authenticated && !hasInternalSession()) {
        throw new Error("Session could not be established.");
      }

      window.location.href = nextPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(message === "Invalid password." ? "Invalid password. Please try again." : message);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>Internal access</span>
      </div>

      <section className="internal-login">
        <h1>Internal access</h1>
        <p>Enter the team password to use Screener and Portfolio Builder.</p>

        {mounted ? (
          <form className="internal-login__form" onSubmit={onSubmit}>
            <label className="portfolio-field">
              <span>Team password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </label>

            {error ? <p className="internal-login__error">{error}</p> : null}

            <button type="submit" className="internal-login__submit" disabled={loading}>
              {loading ? "Signing in..." : "Continue"}
            </button>
          </form>
        ) : (
          <div className="internal-login__form" aria-busy="true">
            <p className="portfolio-empty">Loading...</p>
          </div>
        )}
      </section>
    </>
  );
}

export default function InternalLoginPage() {
  return (
    <Suspense fallback={<div className="portfolio-empty">Loading...</div>}>
      <InternalLoginForm />
    </Suspense>
  );
}

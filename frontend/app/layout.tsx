import type { Metadata } from "next";
import type { MetaResponse } from "@/lib/types";
import { getMeta } from "@/lib/api";
import { tokensToCssVars } from "@/lib/colors";
import { MetaProvider } from "@/components/MetaProvider";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Specialised Investment Funds — Research Dashboard",
  description:
    "Research dashboard for SEBI Specialised Investment Funds (SIFs): search funds and browse static, factual peer comparisons.",
};

// Server-fetch meta so color tokens are injected before first paint (no FOUC).
async function loadMeta(): Promise<MetaResponse | null> {
  try {
    return await getMeta();
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const meta = await loadMeta();
  const rootVars = meta ? tokensToCssVars(meta.meta.colorTokens) : "";

  return (
    <html lang="en">
      <head>
        {rootVars ? (
          <style
            // Inject color tokens from meta.colorTokens as :root custom properties.
            dangerouslySetInnerHTML={{ __html: `:root{${rootVars}}` }}
          />
        ) : null}
      </head>
      <body>
        <MetaProvider initial={meta}>
          <Header />
          <main className="page">{children}</main>
          <footer className="site-footer">
            <span>
              SEBI SIF framework effective{" "}
              {meta?.meta.sebiEffective ?? "2025-04-01"} · Minimum investment{" "}
              {meta?.meta.minInvestment ?? "₹10,00,000"}
            </span>
            <span className="site-footer__note">
              Static, factual research. No returns/performance tracking.
            </span>
          </footer>
        </MetaProvider>
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { InternalGate } from "@/components/InternalGate";
import { Screener } from "@/components/Screener";

export default function ScreenerPage() {
  return (
    <InternalGate>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>Screener</span>
      </div>
      <Screener />
    </InternalGate>
  );
}

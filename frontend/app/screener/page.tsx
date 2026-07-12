"use client";

import Link from "next/link";
import { Screener } from "@/components/Screener";

export default function ScreenerPage() {
  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>Screener</span>
      </div>
      <Screener />
    </>
  );
}

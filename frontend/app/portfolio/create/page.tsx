"use client";

import Link from "next/link";
import { InternalGate } from "@/components/InternalGate";
import { PortfolioBuilder } from "@/components/PortfolioBuilder";

export default function CreatePortfolioPage() {
  return (
    <InternalGate>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>Create portfolio</span>
      </div>
      <PortfolioBuilder />
    </InternalGate>
  );
}

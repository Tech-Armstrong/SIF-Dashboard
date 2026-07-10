"use client";

import Link from "next/link";
import { PortfolioBuilder } from "@/components/PortfolioBuilder";

export default function CreatePortfolioPage() {
  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>Create portfolio</span>
      </div>
      <PortfolioBuilder />
    </>
  );
}

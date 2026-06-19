"use client";

import { useEffect } from "react";
import { useMeta } from "./MetaProvider";
import { Html } from "./Html";

export function SifPrimerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { meta } = useMeta();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="What is a SIF?">
        <div className="modal__bar">
          <span className="modal__title">What is a Specialised Investment Fund?</span>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal__body">
          {meta?.primerHtml ? (
            <Html as="div" className="primer" html={meta.primerHtml} />
          ) : (
            <div className="loading">Loading primer…</div>
          )}
        </div>
      </div>
    </div>
  );
}

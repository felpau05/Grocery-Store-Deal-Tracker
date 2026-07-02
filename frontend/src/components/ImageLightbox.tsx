"use client";

import { useEffect, useState } from "react";

export default function ImageLightbox({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in block ${className ?? ""}`}
        aria-label={`Expand image: ${alt}`}
      >
        <img src={src} alt={alt} className="w-full h-full object-contain" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal
          aria-label={alt}
        >
          <div
            className="relative max-w-2xl w-full animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={src}
              alt={alt}
              className="w-full max-h-[80vh] object-contain rounded-sm border border-border-tan bg-card"
            />
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-sm bg-paper/90 text-ink-soft hover:text-ink font-mono text-lg transition-colors"
              aria-label="Close"
            >
              ×
            </button>
            <p className="text-center font-mono text-[11px] text-ink-soft/70 mt-2">{alt}</p>
          </div>
        </div>
      )}
    </>
  );
}

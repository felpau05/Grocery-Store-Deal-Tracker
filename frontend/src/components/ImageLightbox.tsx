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
        className={`cursor-zoom-in block w-full h-full rounded-control ${className ?? ""}`}
        aria-label={`Expand image: ${alt}`}
      >
        <img src={src} alt={alt} className="w-full h-full object-contain" />
      </button>

      {open && (
        // The scrim is the one place a wash is still right — it's not a
        // card, it's the page being pushed back. No blur: the surfaces
        // above it are opaque now, so the blur only cost GPU time.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/55"
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
              className="w-full max-h-[80vh] object-contain rounded-card border border-line bg-surface shadow-soft-lg p-3"
            />
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-pill bg-surface border border-line text-ink-soft hover:text-ink hover:bg-surface-2 text-lg leading-none transition-colors"
              aria-label="Close"
            >
              ×
            </button>
            <p className="text-center text-[12px] text-ink-soft mt-3">{alt}</p>
          </div>
        </div>
      )}
    </>
  );
}

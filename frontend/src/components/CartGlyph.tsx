export default function CartGlyph({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="9" cy="20.5" r="1.5" />
      <circle cx="18.5" cy="20.5" r="1.5" />
      <path d="M2 3h2.5l2.4 11.6a2 2 0 0 0 2 1.4h8.6a2 2 0 0 0 2-1.6L21.5 7H5.5" />
    </svg>
  );
}

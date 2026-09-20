/**
 * The app's line icons. Drawn rather than typed: the four action tiles
 * used to carry emoji (⚙️ 🛒 🧾 📝), which render as a different picture
 * in a different style on every OS, sit off the type baseline, and read
 * as placeholder art next to hand-tuned tokens.
 *
 * House rules, so a new one matches: a 24x24 box, `currentColor` (the
 * tile colours them, never the icon), 1.5 stroke, round caps and joins,
 * no fill. Size with the `size` prop, colour with a text-* class.
 */
type IconProps = { size?: number; className?: string };

function Svg({ size = 24, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Account and preferences — a sliders panel, not a cog: what this tile
 *  opens is a postal code and a set of stores, which are settings you
 *  adjust rather than machinery you configure. */
export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </Svg>
  );
}

/** Browse the catalogue. */
export function IconCart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.25L20 8H6" />
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="17" cy="19.5" r="1.4" />
    </Svg>
  );
}

/** A costed trip — a receipt, with its torn bottom edge. */
export function IconReceipt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 20V3Z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </Svg>
  );
}

/** Start a new list. */
export function IconList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6h11M9 12h11M9 18h6" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </Svg>
  );
}

/* ── Category glyphs ─────────────────────────────────────────────────
   One per category shelf, so a wall of 19 tiles has something to scan
   by other than text. Drawn rather than emoji: an emoji is a different
   picture on every OS (and a different WEIGHT — 🥬 is a solid block of
   colour next to 🧊's pale outline), can't take the tile's colour, and
   sits off the type baseline. These are the same 24px/1.5-stroke box as
   the icons above, so the grid reads as one set. No dependency: the
   whole sheet is smaller than a single emoji font fallback. */

function Wine(p: IconProps) { return <Svg {...p}><path d="M7.5 3h9l-.6 5.4A4 4 0 0 1 12 12a4 4 0 0 1-3.9-3.6L7.5 3Z" /><path d="M12 12v8M8.5 20h7" /></Svg>; }
function Bottle(p: IconProps) { return <Svg {...p}><path d="M10.8 2.5h2.4v2h-2.4z" /><path d="M9.4 4.5h5.2v2H9.4z" /><path d="M9.8 6.5h4.4l.6 12.1a2 2 0 0 1-2 2.1h-1.6a2 2 0 0 1-2-2.1l.6-12.1Z" /><path d="M11 11h2.4M11 14h2.4" /></Svg>; }
function Bread(p: IconProps) { return <Svg {...p}><path d="M3.8 13.4C3.8 9.8 7.5 6.9 12 6.9s8.2 2.9 8.2 6.5v3.9a1.7 1.7 0 0 1-1.7 1.7H5.5a1.7 1.7 0 0 1-1.7-1.7v-3.9Z" /><path d="M8.7 7.5V19M15.3 7.5V19" /></Svg>; }
function Cup(p: IconProps) { return <Svg {...p}><path d="M6 7.5h12l-1.1 11.6a2 2 0 0 1-2 1.8H9.1a2 2 0 0 1-2-1.8L6 7.5Z" /><path d="M6.6 12h10.8" /><path d="m13.8 7.5 2.4-4.2" /></Svg>; }
function Bowl(p: IconProps) { return <Svg {...p}><path d="M2.8 11h18.4a9.2 9.2 0 0 1-18.4 0Z" /><path d="M6.6 7.6c.8-.7.8-1.7 0-2.4M10.6 7.6c.8-.7.8-1.7 0-2.4M14.6 7.6c.8-.7.8-1.7 0-2.4" /></Svg>; }
function Can(p: IconProps) { return <Svg {...p}><ellipse cx="12" cy="5.8" rx="5.8" ry="2.6" /><path d="M6.2 5.8v12.4c0 1.4 2.6 2.6 5.8 2.6s5.8-1.2 5.8-2.6V5.8" /><path d="M8.6 11h6.8" /></Svg>; }
function Cheese(p: IconProps) { return <Svg {...p}><path d="M3.2 15.4 15.6 7.2l5.2 3.1v5a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6v-.9Z" /><circle cx="9" cy="14" r="1.1" /><circle cx="15.4" cy="13.4" r="1.1" /></Svg>; }
function Egg(p: IconProps) { return <Svg {...p}><path d="M15.2 3.2c2.5 0 4.6 3.4 4.6 6.4s-2.1 5.5-4.6 5.5-4.6-2.5-4.6-5.5 2.1-6.4 4.6-6.4Z" /><path d="M8.6 10.4c2.2 0 4 2.9 4 5.6s-1.8 4.7-4 4.7-4-2-4-4.7 1.8-5.6 4-5.6Z" /></Svg>; }
function Bacon(p: IconProps) { return <Svg {...p}><path d="M3.4 14.8c2.3-3.1 4.6 1.3 6.9-1.8s4.6 1.3 6.9-1.8l2.4 3.6c-2.3 3.1-4.6-1.3-6.9 1.8s-4.6-1.3-6.9 1.8l-2.4-3.6Z" /></Svg>; }
function Noodles(p: IconProps) { return <Svg {...p}><path d="M3.2 12.5h17.6a8.8 8.8 0 0 1-17.6 0Z" /><path d="M7 9.6c1.2-2.5 2.6-2.5 3.8 0s2.6 2.5 3.8 0" /></Svg>; }
function Snowflake(p: IconProps) { return <Svg {...p}><path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2 3.8 16.8" /><path d="m9.4 5 2.6 2.4L14.6 5M9.4 19l2.6-2.4 2.6 2.4" /></Svg>; }
function Sponge(p: IconProps) { return <Svg {...p}><path d="M3.6 9.6h16.8v8.4a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V9.6Z" /><path d="M3.6 14h16.8" /><circle cx="8" cy="6" r="1.6" /><circle cx="13" cy="4.7" r="1.2" /><circle cx="16.6" cy="6.4" r="1" /></Svg>; }
function Globe(p: IconProps) { return <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.4 2.4 3.6 5.4 3.6 9S14.4 18.6 12 21c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z" /></Svg>; }
function Steak(p: IconProps) { return <Svg {...p}><path d="M4.9 10.4c1.9-3.2 5.3-5 9-5 3.9 0 6.7 2.1 6.7 5.2 0 4-3.4 8.4-8.2 8.4-4.5 0-9.5-3.6-7.5-8.6Z" /><path d="m9.2 9.4 3.3 3.3M12.5 8.5l3 3" /></Svg>; }
function Salt(p: IconProps) { return <Svg {...p}><path d="M9.2 4.6h5.6l.9 4.2H8.3l.9-4.2Z" /><path d="M8.1 8.8h7.8l.8 10.4a1.8 1.8 0 0 1-1.8 1.9H9.1a1.8 1.8 0 0 1-1.8-1.9l.8-10.4Z" /><path d="M11 6.4h.01M13 6.4h.01M12 7.6h.01" /></Svg>; }
function Lotion(p: IconProps) { return <Svg {...p}><path d="M9 9h6v10.5a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V9Z" /><path d="M10.6 9V6.5h2.8V9" /><path d="M13.4 5H16v2.2" /><path d="M9.8 13.4h4.4" /></Svg>; }
function Paw(p: IconProps) { return <Svg {...p}><ellipse cx="7.6" cy="10" rx="1.9" ry="2.4" /><ellipse cx="12" cy="8.4" rx="1.9" ry="2.5" /><ellipse cx="16.4" cy="10" rx="1.9" ry="2.4" /><path d="M12 13.2c3 0 5.2 1.9 5.2 4S15 21 12 21s-5.2-1.1-5.2-3.8 2.2-4 5.2-4Z" /></Svg>; }
function Leaf(p: IconProps) { return <Svg {...p}><path d="M12 21c0-6.2 3.6-11.2 9.2-12.3C21.2 15 17.6 20 12 21Z" /><path d="M12 21C12 14.8 8.4 9.8 2.8 8.7 2.8 15 6.4 20 12 21Z" /><path d="M12 21v-4.6" /></Svg>; }
function Fish(p: IconProps) { return <Svg {...p}><path d="M2.8 12c2.6-3.9 6.2-6 9.9-6 2.9 0 5.2 1.3 6.5 2.7l2.3-2.1v10.8l-2.3-2.1C17.9 16.7 15.6 18 12.7 18c-3.7 0-7.3-2.1-9.9-6Z" /><path d="M8 10.6h.01" /></Svg>; }
function Popcorn(p: IconProps) { return <Svg {...p}><circle cx="12" cy="12" r="8.8" /><circle cx="9.4" cy="9.9" r=".95" /><circle cx="14.5" cy="9.5" r=".95" /><circle cx="12.6" cy="14.4" r=".95" /><circle cx="8.7" cy="14.6" r=".85" /></Svg>; }
function Tag(p: IconProps) { return <Svg {...p}><path d="M3.5 11.6V4.6a1.1 1.1 0 0 1 1.1-1.1h7l9 9-8.1 8.1-9-9Z" /><path d="M8 8h.01" /></Svg>; }

/** Category shelf → glyph. Keys are the backend's category strings, so
 *  both spellings of the split shelves ("dairy" / "dairy eggs") map. */
const CATEGORY_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  alcohol: Wine,
  babies: Bottle,
  bakery: Bread,
  beverages: Cup,
  breakfast: Bowl,
  "breakfast and cereal": Bowl,
  "canned goods": Can,
  dairy: Cheese,
  "dairy eggs": Egg,
  deli: Bacon,
  "dry goods pasta": Noodles,
  frozen: Snowflake,
  household: Sponge,
  international: Globe,
  meat: Steak,
  "meat seafood": Steak,
  other: IconCart,
  pantry: Salt,
  "personal care": Lotion,
  pets: Paw,
  produce: Leaf,
  seafood: Fish,
  snacks: Popcorn,
};

/** The glyph for a category shelf, falling back to a price tag. */
export function CategoryIcon({ name, ...rest }: IconProps & { name: string }) {
  const Glyph = CATEGORY_ICONS[name] ?? Tag;
  return <Glyph {...rest} />;
}

/* ── Category shelf → colour ─────────────────────────────────────────
   The tint the glyph's chip wears on a category tile. Nineteen shelves
   in one grid all carrying the same accent-green swatch means reading
   every label to find Produce; hue gets you there in a glance, and the
   drawn glyph on its own wasn't enough (a leaf and a fish are the same
   weight of grey line at 22px).

   The pairs live in globals.css under "Category shelf colours" — see
   the note there for why this is the one place in the app that breaks
   the single-accent rule, and why it stays the only one. Written out as
   whole class strings rather than built from the hue name: Tailwind
   scans source text, so `bg-cat-${hue}-soft` would generate nothing. */
const CATEGORY_TINTS: Record<string, string> = {
  produce: "bg-cat-green-soft text-cat-green",
  meat: "bg-cat-red-soft text-cat-red",
  "meat seafood": "bg-cat-red-soft text-cat-red",
  seafood: "bg-cat-ocean-soft text-cat-ocean",
  dairy: "bg-cat-butter-soft text-cat-butter",
  "dairy eggs": "bg-cat-butter-soft text-cat-butter",
  bakery: "bg-cat-wheat-soft text-cat-wheat",
  breakfast: "bg-cat-wheat-soft text-cat-wheat",
  "breakfast and cereal": "bg-cat-wheat-soft text-cat-wheat",
  deli: "bg-cat-rose-soft text-cat-rose",
  frozen: "bg-cat-ice-soft text-cat-ice",
  "canned goods": "bg-cat-olive-soft text-cat-olive",
  "dry goods pasta": "bg-cat-clay-soft text-cat-clay",
  pantry: "bg-cat-slate-soft text-cat-slate",
  snacks: "bg-cat-orange-soft text-cat-orange",
  beverages: "bg-cat-teal-soft text-cat-teal",
  household: "bg-cat-teal-soft text-cat-teal",
  international: "bg-cat-indigo-soft text-cat-indigo",
  alcohol: "bg-cat-plum-soft text-cat-plum",
  "personal care": "bg-cat-plum-soft text-cat-plum",
  babies: "bg-cat-sky-soft text-cat-sky",
  pets: "bg-cat-clay-soft text-cat-clay",
  other: "bg-cat-slate-soft text-cat-slate",
};

/** Fill + glyph classes for a shelf's icon chip. Anything the backend
 *  adds later gets the neutral slate rather than no colour at all, so a
 *  new shelf never lands as the one grey tile in a coloured grid. */
export function categoryTint(name: string): string {
  return CATEGORY_TINTS[name] ?? "bg-cat-slate-soft text-cat-slate";
}

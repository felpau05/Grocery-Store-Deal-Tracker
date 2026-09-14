/** Route-level skeleton for the item page — its data is fetched
 *  server-side, so without this the navigation feels frozen. Mirrors
 *  the real layout: back link, product header card, spec card, chart. */
export default function ItemLoading() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 animate-shimmer" aria-busy>
      <div className="h-4 w-28 rounded-pill bg-ink/10" />

      <div className="card-soft mt-5 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-control bg-surface-3 border border-line shrink-0" />
          <div className="flex-1">
            <div className="h-3 w-24 rounded-pill bg-ink/10" />
            <div className="h-6 w-3/4 rounded-pill bg-ink/10 mt-2.5" />
            <div className="h-3 w-32 rounded-pill bg-ink/10 mt-2.5" />
            <div className="flex gap-2 mt-4">
              <div className="h-5 w-16 rounded-pill bg-surface-3" />
              <div className="h-5 w-14 rounded-pill bg-surface-3" />
            </div>
            <div className="h-11 w-28 rounded-control bg-surface-3 mt-5" />
          </div>
        </div>
      </div>

      <div className="h-5 w-24 rounded-pill bg-ink/10 mt-8 mb-3" />
      <div className="card-soft px-5 py-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-24 rounded-pill bg-ink/10" />
            <div className="h-3 w-28 rounded-pill bg-ink/10" />
          </div>
        ))}
      </div>

      <div className="h-5 w-44 rounded-pill bg-ink/10 mt-8 mb-3" />
      <div className="h-64 card-soft" />
    </main>
  );
}

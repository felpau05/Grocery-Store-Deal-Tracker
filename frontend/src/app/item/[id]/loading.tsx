/** Route-level skeleton for the item page — its data is fetched
 *  server-side, so without this the navigation feels frozen. */
export default function ItemLoading() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 animate-shimmer" aria-busy>
      <div className="h-4 w-28 bg-ink/10" />
      <div className="flex items-start gap-5 mt-6">
        <div className="w-28 h-28 bg-ink/10 border-2 border-ink/20 shrink-0" />
        <div className="flex-1">
          <div className="h-3 w-24 bg-ink/10" />
          <div className="h-6 w-3/4 bg-ink/10 mt-2" />
          <div className="h-3 w-32 bg-ink/10 mt-2" />
        </div>
        <div className="w-20 h-12 bg-tag/50 -rotate-3 shrink-0" />
      </div>
      <div className="tear-line my-6" />
      <div className="border-2 border-ink/20 bg-card px-4 py-3 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-20 bg-ink/10" />
            <div className="h-3 w-28 bg-ink/10" />
          </div>
        ))}
      </div>
      <div className="h-5 w-44 bg-ink/10 mt-8 mb-3" />
      <div className="h-64 border-2 border-ink/20 bg-card" />
    </main>
  );
}

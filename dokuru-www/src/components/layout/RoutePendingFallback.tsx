function PendingBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted/60 ${className}`} />;
}

export function RoutePendingFallback() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <PendingBlock className="h-9 w-52" />
          <PendingBlock className="h-4 w-40" />
        </div>
        <div className="flex flex-wrap gap-2">
          <PendingBlock className="h-10 w-36 rounded-lg" />
          <PendingBlock className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      <div className="rounded-[18px] border border-border bg-card/80 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-3">
            <PendingBlock className="h-10 w-36 rounded-lg" />
            <PendingBlock className="h-10 w-32 rounded-lg" />
            <PendingBlock className="h-10 w-44 rounded-lg" />
          </div>
          <PendingBlock className="h-10 w-full rounded-lg lg:w-80" />
        </div>

        <div className="space-y-3 pt-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-4 rounded-xl border border-border/70 bg-background/35 p-4 sm:flex-row sm:items-center">
              <PendingBlock className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <PendingBlock className="h-4 w-48 max-w-full" />
                <PendingBlock className="h-3 w-80 max-w-full" />
              </div>
              <div className="flex shrink-0 gap-2">
                <PendingBlock className="h-8 w-20 rounded-md" />
                <PendingBlock className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

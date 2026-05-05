function PendingBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted/60 ${className}`} />;
}

export function RoutePendingFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <PendingBlock className="h-8 w-56" />
          <PendingBlock className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <PendingBlock className="h-9 w-32" />
          <PendingBlock className="h-9 w-40" />
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex gap-2">
              <PendingBlock className="h-3 w-3 rounded-full" />
              <PendingBlock className="h-3 w-3 rounded-full" />
              <PendingBlock className="h-3 w-3 rounded-full" />
            </div>
            <PendingBlock className="h-5 w-72 max-w-[56vw]" />
          </div>
          <PendingBlock className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="space-y-6 p-6">
            <PendingBlock className="h-3 w-28" />
            <div className="flex items-end gap-3">
              <PendingBlock className="h-20 w-32" />
              <PendingBlock className="mb-2 h-7 w-16" />
            </div>
            <PendingBlock className="h-2 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-3">
              <PendingBlock className="h-24 rounded-[12px]" />
              <PendingBlock className="h-24 rounded-[12px]" />
              <PendingBlock className="h-24 rounded-[12px]" />
            </div>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="space-y-2">
                <PendingBlock className="h-3 w-36" />
                <PendingBlock className="h-3 w-44" />
              </div>
              <PendingBlock className="h-10 w-40 rounded-[10px]" />
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center gap-3">
                  <PendingBlock className="h-5 w-9" />
                  <PendingBlock className="h-4 flex-1" />
                  <PendingBlock className="h-4 w-10" />
                </div>
                <PendingBlock className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <PendingBlock className="h-9 w-40 rounded-lg" />
          <PendingBlock className="h-9 flex-1 rounded-lg" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <PendingBlock key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

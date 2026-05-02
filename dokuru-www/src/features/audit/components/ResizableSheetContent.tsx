import { useState, type ComponentProps } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type ResizableSheetContentProps = ComponentProps<typeof SheetContent> & {
    storageKey: string;
    defaultWidth: number;
    minWidth?: number;
};

function clampWidth(width: number, minWidth: number) {
    const maxWidth = Math.max(320, window.innerWidth - 16);
    return Math.min(Math.max(width, Math.min(minWidth, maxWidth)), maxWidth);
}

export function ResizableSheetContent({
    storageKey,
    defaultWidth,
    minWidth = 420,
    className,
    style,
    children,
    ...props
}: ResizableSheetContentProps) {
    const [width, setWidth] = useState(() => {
        if (typeof window === "undefined") return defaultWidth;
        const saved = Number(window.localStorage.getItem(storageKey));
        return clampWidth(Number.isFinite(saved) && saved > 0 ? saved : defaultWidth, minWidth);
    });
    const [dragging, setDragging] = useState(false);

    const updateWidth = (clientX: number) => {
        const nextWidth = clampWidth(window.innerWidth - clientX, minWidth);
        setWidth(nextWidth);
        window.localStorage.setItem(storageKey, String(Math.round(nextWidth)));
    };

    return (
        <SheetContent
            className={cn("audit-fix-sheet w-full p-0 flex flex-col gap-0 overflow-hidden", className)}
            style={{
                ...style,
                width,
                maxWidth: "calc(100vw - 16px)",
            }}
            {...props}
        >
            <button
                type="button"
                aria-label="Resize remediation sidebar"
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragging(true);
                    updateWidth(event.clientX);
                }}
                onPointerMove={(event) => {
                    if (dragging) updateWidth(event.clientX);
                }}
                onPointerUp={(event) => {
                    setDragging(false);
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => setDragging(false)}
                className={cn(
                    "group absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1.5 cursor-ew-resize touch-none sm:block",
                    dragging && "cursor-ew-resize",
                )}
            >
                <span className="absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary" />
            </button>
            {children}
        </SheetContent>
    );
}

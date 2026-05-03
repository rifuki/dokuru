import { useEffect, useState, type ComponentProps } from "react";
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

    useEffect(() => {
        if (!dragging) return;
        const previousCursor = document.documentElement.style.cursor;
        const previousUserSelect = document.documentElement.style.userSelect;
        document.documentElement.style.cursor = "e-resize";
        document.documentElement.style.userSelect = "none";
        return () => {
            document.documentElement.style.cursor = previousCursor;
            document.documentElement.style.userSelect = previousUserSelect;
        };
    }, [dragging]);

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
            <div
                role="separator"
                aria-orientation="vertical"
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
                style={{ cursor: "e-resize" }}
                className={cn(
                    "group absolute inset-y-0 left-0 z-50 hidden w-4 touch-none !cursor-e-resize sm:block",
                    dragging && "!cursor-e-resize",
                )}
            >
                <span className="absolute left-0 top-1/2 h-14 w-px -translate-y-1/2 bg-white/18 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            {children}
        </SheetContent>
    );
}

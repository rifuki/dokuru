import type { FixProgress } from "@/lib/api/agent-direct";

function progressExactKey(event: FixProgress) {
    return [
        event.rule_id,
        event.container_name,
        event.step,
        event.total_steps,
        event.action,
        event.status,
        event.detail ?? "",
        event.command ?? "",
        event.stdout ?? "",
        event.stderr ?? "",
    ].join("\0");
}

function progressUpdateKey(event: FixProgress) {
    return [
        event.rule_id,
        event.container_name,
        event.step,
        event.total_steps,
        event.action,
        event.command ?? "",
    ].join("\0");
}

function canUpdateInPlace(event: FixProgress) {
    return event.status === "in_progress" && !event.stdout && !event.stderr;
}

export function appendFixProgressEvents(base: FixProgress[], incoming: FixProgress[]) {
    const events: FixProgress[] = [];
    const seen = new Set<string>();

    for (const event of [...base, ...incoming]) {
        const exactKey = progressExactKey(event);
        if (seen.has(exactKey)) continue;

        let replaceIndex = -1;
        if (canUpdateInPlace(event)) {
            const updateKey = progressUpdateKey(event);
            for (let i = events.length - 1; i >= 0; i -= 1) {
                if (canUpdateInPlace(events[i]) && progressUpdateKey(events[i]) === updateKey) {
                    replaceIndex = i;
                    break;
                }
            }
        }

        if (replaceIndex >= 0) {
            seen.delete(progressExactKey(events[replaceIndex]));
            events[replaceIndex] = event;
        } else {
            events.push(event);
        }

        seen.add(exactKey);
    }

    return events;
}

export function coalesceFixProgressEvents(events: FixProgress[]) {
    return appendFixProgressEvents([], events);
}

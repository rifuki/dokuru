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

function progressActionKey(event: FixProgress) {
    return [
        event.rule_id,
        event.container_name,
        event.step,
        event.total_steps,
        event.action,
    ].join("\0");
}

function canUpdateInPlace(event: FixProgress) {
    return event.status === "in_progress" && !event.stdout && !event.stderr;
}

function appendOutput(existing: string | undefined, incoming: string | undefined) {
    const next = incoming?.trimEnd();
    if (!next) return existing;
    const current = existing?.trimEnd();
    if (!current) return next;
    if (current === next || current.includes(next)) return current;
    if (next.startsWith(current)) return next;
    return `${current}\n${next}`;
}

function mergedStatus(existing: FixProgress["status"], incoming: FixProgress["status"]) {
    if (existing === "error" || incoming === "error") return "error";
    if (incoming === "done" || existing === "done") return "done";
    return incoming;
}

function mergeProgressEvent(existing: FixProgress, incoming: FixProgress): FixProgress {
    return {
        ...existing,
        ...incoming,
        command: incoming.command ?? existing.command,
        detail: incoming.detail ?? existing.detail,
        status: mergedStatus(existing.status, incoming.status),
        stdout: appendOutput(existing.stdout, incoming.stdout),
        stderr: appendOutput(existing.stderr, incoming.stderr),
    };
}

function commandAggregateKey(event: FixProgress) {
    if (!event.command) return null;
    return progressUpdateKey(event);
}

function findReplaceIndex(events: FixProgress[], event: FixProgress) {
    const aggregateKey = commandAggregateKey(event);
    if (aggregateKey) {
        for (let i = events.length - 1; i >= 0; i -= 1) {
            if (commandAggregateKey(events[i]) === aggregateKey) return i;
        }
    }

    if (!event.command && !event.stdout && !event.stderr) {
        const actionKey = progressActionKey(event);
        for (let i = events.length - 1; i >= 0; i -= 1) {
            const existing = events[i];
            if (
                progressActionKey(existing) === actionKey
                && existing.status === "in_progress"
                && !existing.stdout
                && !existing.stderr
            ) return i;
        }
    }

    if (canUpdateInPlace(event)) {
        const updateKey = progressUpdateKey(event);
        for (let i = events.length - 1; i >= 0; i -= 1) {
            if (canUpdateInPlace(events[i]) && progressUpdateKey(events[i]) === updateKey) return i;
        }
    }

    return -1;
}

export function appendFixProgressEvents(base: FixProgress[], incoming: FixProgress[]) {
    const events: FixProgress[] = [];
    const seen = new Set<string>();

    for (const event of [...base, ...incoming]) {
        const exactKey = progressExactKey(event);
        if (seen.has(exactKey)) continue;

        const replaceIndex = findReplaceIndex(events, event);

        if (replaceIndex >= 0) {
            seen.delete(progressExactKey(events[replaceIndex]));
            events[replaceIndex] = mergeProgressEvent(events[replaceIndex], event);
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

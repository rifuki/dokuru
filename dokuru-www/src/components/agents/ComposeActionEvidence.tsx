import { ActionEvidence, type ActionEvidenceRun } from "@/components/agents/ActionEvidence";
import { useComposeActionStore, type ComposeActionKind } from "@/stores/use-compose-action-store";

function actionLabel(action: ComposeActionKind) {
  return action === "up" ? "Up" : "Down";
}

export function ComposeActionEvidence() {
  const runs = useComposeActionStore((state) => state.runs);
  const open = useComposeActionStore((state) => state.evidenceOpen);
  const setOpen = useComposeActionStore((state) => state.setEvidenceOpen);
  const clearRuns = useComposeActionStore((state) => state.clearRuns);

  const evidenceRuns: ActionEvidenceRun[] = runs.map((run) => ({
    id: run.id,
    title: `${actionLabel(run.action)} ${run.stackName}`,
    startedAt: run.startedAt,
    isRunning: run.isRunning,
    chunks: run.chunks.map((chunk) => ({
      ...chunk,
      stream: chunk.stream === "stderr" ? "stdout" : chunk.stream,
    })),
    success: run.final?.success ?? (run.error ? false : null),
    finalLine: run.final
      ? `exit_code=${run.final.exit_code ?? "unknown"} success=${String(run.final.success)}${run.final.stack ? ` status=${run.final.stack.status} running=${run.final.stack.running}/${run.final.stack.total}` : ""}\n`
      : null,
    error: run.error,
  }));

  return (
    <ActionEvidence
      runs={evidenceRuns}
      open={open}
      onOpenChange={setOpen}
      onClear={clearRuns}
      emptyMessage="Run up or down to capture terminal evidence here."
    />
  );
}

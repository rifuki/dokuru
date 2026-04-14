import { createFileRoute } from '@tanstack/react-router'
// import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Shield, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'

import { FixActionDialog } from '@/components/remediation/FixActionDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAudit } from '@/features/audit/hooks/use-audit'
import { useApplyFix } from '@/features/fix/hooks/use-apply-fix'
import type { CheckResult, FixOutcome } from '@/types/dokuru'

export const Route = createFileRoute('/fix')({
  component: FixPage,
})

function FixPage() {
  const { data: report } = useAudit()
  const { mutateAsync: applyFix, isPending } = useApplyFix()
  const [selectedRule, setSelectedRule] = useState<CheckResult | null>(null)
  const [lastOutcome, setLastOutcome] = useState<FixOutcome | null>(null)

  const failedRules = useMemo(
    () => report?.results.filter((result) => result.status === 'Fail') ?? [],
    [report],
  )

  const handleConfirm = async () => {
    if (!selectedRule) return

    const outcome = await applyFix(selectedRule.rule.id)
    setLastOutcome(outcome)

    if (outcome.status !== 'blocked') {
      setSelectedRule(null)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="neo-card px-4 py-4 md:px-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-kicker">
              <Wrench className="h-3.5 w-3.5" />
              Guided Remediation
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white md:text-3xl">Safe fixes, with operator context.</h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              Dokuru separates daemon-level auto-fix from runtime guidance, so you can remediate what is safe directly and preview what still needs redeploy or elevated host access.
            </p>
          </div>

          <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Open remediation queue</p>
            <p className="mt-2 text-2xl font-semibold text-white">{failedRules.length}</p>
            <p className="mt-2">Controls awaiting action</p>
          </div>
        </div>
      </section>

      {lastOutcome ? (
        <section className={`panel-outline rounded-md border p-4 ${outcomePanelClass(lastOutcome.status)}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/85">Latest remediation outcome</p>
              <p className="mt-3 text-lg font-medium text-white">Rule {lastOutcome.rule_id}</p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-200/90">{lastOutcome.message}</p>
              {lastOutcome.restart_command ? (
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-300/80">Next step: {lastOutcome.restart_command}</p>
              ) : null}
            </div>
            <Badge variant="outline" className="w-fit border-white/12 bg-white/8 px-3 py-1 text-white">
              {lastOutcome.status}
            </Badge>
          </div>
        </section>
      ) : null}

      {!report ? (
        <section className="neo-card p-4">
          <div className="py-12 text-center text-slate-400">
            <Shield className="mx-auto h-10 w-10 text-sky-200/80" />
            <h3 className="mt-5 text-2xl font-semibold text-white">Remediation queue is waiting for an audit</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7">
              Run a live audit first so Dokuru can identify which daemon or runtime controls still need hardening.
            </p>
          </div>
        </section>
      ) : null}

      {report && failedRules.length === 0 ? (
        <section className="neo-card p-4">
          <div className="flex flex-col items-center py-12 text-center">
            <div className="rounded-md border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-200">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h3 className="mt-6 text-xl font-semibold text-white">No open remediation queue</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              The latest audit shows no failing CIS controls. Keep rerunning audits after infrastructure changes to catch drift before it spreads.
            </p>
          </div>
        </section>
      ) : null}

      {failedRules.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
          <div className="neo-card p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-amber-400/18 bg-amber-400/10 p-2 text-amber-200">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-semibold text-white">How remediation works</p>
                <p className="text-sm text-slate-400">Dokuru distinguishes what can be safely changed now from what must remain guided.</p>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm leading-7 text-slate-300">
              <div className="rounded-md border border-white/8 bg-white/4 p-3">
                <p className="font-medium text-white">Auto</p>
                <p className="mt-2">Host changes that Dokuru can write directly, such as daemon configuration, provided the agent has the right privileges.</p>
              </div>
              <div className="rounded-md border border-white/8 bg-white/4 p-3">
                <p className="font-medium text-white">Guided</p>
                <p className="mt-2">Runtime flags that should be changed in Compose files, deployment manifests, or Docker run commands before redeploying workloads.</p>
              </div>
              <div className="rounded-md border border-white/8 bg-white/4 p-3">
                <p className="font-medium text-white">Blocked</p>
                <p className="mt-2">Dokuru will explain when the running service lacks permission, instead of crashing the workflow with a raw filesystem error.</p>
              </div>
            </div>
          </div>

          <div className="neo-card p-4">
            <div>
              <p className="text-lg font-semibold text-white">Remediation queue</p>
              <p className="mt-2 text-sm leading-7 text-slate-400">Each control includes context, safe action scope, and the next operator move if Dokuru cannot apply it directly.</p>
            </div>

            <div className="mt-6 space-y-4">
              {failedRules.map((result) => (
                <div
                  key={result.rule.id}
                  className="rounded-md border border-white/8 bg-white/4 p-4 transition hover:bg-white/7"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">Rule {result.rule.id}</span>
                        <Badge variant="destructive" className="border-rose-400/20 bg-rose-400/12 text-rose-100">Needs action</Badge>
                        <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-100">{result.remediation_kind}</Badge>
                        <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-100">{result.rule.section}</Badge>
                      </div>
                      <p className="mt-4 text-base font-medium text-white">{result.rule.title}</p>
                      <p className="mt-3 text-sm leading-7 text-slate-300">{result.message}</p>
                      <div className="mt-4 rounded-md border border-sky-400/12 bg-sky-400/8 px-4 py-3 text-sm leading-7 text-sky-50/90">
                        {result.rule.remediation}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-3 lg:w-[220px]">
                      <Button
                        className="w-full rounded bg-zinc-200 py-2.5 text-sm font-semibold text-black hover:bg-zinc-300"
                        onClick={() => setSelectedRule(result)}
                      >
                        {result.remediation_kind === 'auto' ? 'Apply remediation' : 'Preview guidance'}
                      </Button>
                      <div className="rounded-md border border-white/8 bg-slate-950/50 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {result.rule.severity} severity
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <FixActionDialog
        open={selectedRule !== null}
        result={selectedRule}
        isApplying={isPending}
        onClose={() => setSelectedRule(null)}
        onConfirm={handleConfirm}
      />
    </div>
  )
}

function outcomePanelClass(status: FixOutcome['status']) {
  switch (status) {
    case 'applied':
      return 'border-emerald-400/16 bg-emerald-400/10'
    case 'blocked':
      return 'border-rose-400/16 bg-rose-400/10'
    default:
      return 'border-sky-400/16 bg-sky-400/10'
  }
}

import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Play, Shield, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAudit } from '@/features/audit/hooks/use-audit'

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})

function AuditPage() {
  const { data: report, isLoading, refetch, isFetching } = useAudit(false)
  const loading = isLoading || isFetching

  const failing = report?.results.filter((result) => result.status === 'Fail') ?? []
  const healthy = report?.results.filter((result) => result.status === 'Pass') ?? []

  return (
    <div className="space-y-6 pb-8">
      <motion.section
        className="glass-surface panel-outline rounded-[32px] px-6 py-7 md:px-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-kicker">
              <Shield className="h-3.5 w-3.5" />
              CIS Audit Engine
            </div>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-5xl">Live audit cockpit</h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              Trigger a fresh CIS Docker Benchmark pass, inspect the latest findings, and move directly into remediation for anything still failing.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => refetch()}
              disabled={loading}
              className="rounded-full bg-[linear-gradient(135deg,#38BDF8,#6366F1)] px-5 py-6 text-sm font-semibold text-slate-950 hover:opacity-95"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-950/40 border-t-transparent animate-spin" />
                  Auditing host...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Run fresh audit
                </span>
              )}
            </Button>
            <Link
              to="/fix"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Open remediation
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <SummaryTile label="Last score" value={report ? `${report.score}` : '--'} suffix="/100" />
          <SummaryTile label="Failing controls" value={String(failing.length)} suffix="issues" tone="danger" />
          <SummaryTile label="Compliant controls" value={String(healthy.length)} suffix="pass" tone="success" />
        </div>
      </motion.section>

      {!report && !loading ? (
        <motion.section className="glass-card panel-outline rounded-[28px] p-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-[28px] border border-white/10 bg-white/6 p-4 text-sky-200">
              <Shield className="h-10 w-10" />
            </div>
            <h3 className="mt-6 text-2xl font-semibold text-white">No audit snapshot yet</h3>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              Trigger the first audit to map daemon posture, runtime isolation, and remediation priority across the active Docker host.
            </p>
          </div>
        </motion.section>
      ) : null}

      {loading && !report ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass-card rounded-[28px] border border-white/8 bg-white/5 p-6">
              <div className="h-5 w-32 animate-pulse rounded-full bg-white/10" />
              <div className="mt-5 h-8 w-56 animate-pulse rounded-full bg-white/10" />
              <div className="mt-4 h-20 animate-pulse rounded-[20px] bg-white/10" />
            </div>
          ))}
        </section>
      ) : null}

      {report ? (
        <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <motion.div className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
            <div className="flex items-center gap-3">
              <span className="rounded-2xl border border-rose-400/16 bg-rose-400/10 p-2.5 text-rose-200">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-semibold text-white">Needs attention</p>
                <p className="text-sm text-slate-400">Controls currently blocking a fully hardened posture.</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {failing.length === 0 ? (
                <div className="rounded-[24px] border border-emerald-400/16 bg-emerald-400/8 px-5 py-6 text-sm text-emerald-100">
                  No failing controls in the latest audit snapshot.
                </div>
              ) : (
                failing.map((result) => (
                  <div key={result.rule.id} className="rounded-[24px] border border-rose-400/12 bg-rose-400/6 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">Rule {result.rule.id}</span>
                      <StatusBadge value={result.status} />
                      <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-200">{result.rule.severity}</Badge>
                    </div>
                    <p className="mt-3 text-base font-medium text-slate-100">{result.rule.title}</p>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{result.message}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">{result.rule.section}</p>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          <motion.div className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div>
              <p className="text-lg font-semibold text-white">All rule results</p>
              <p className="mt-2 text-sm leading-7 text-slate-400">Complete breakdown of daemon and runtime controls evaluated during the latest pass.</p>
            </div>

            <div className="mt-6 space-y-3">
              {report.results.map((result, index) => (
                <motion.div
                  key={`${result.rule.id}-${result.status}`}
                  className="rounded-[24px] border border-white/8 bg-white/4 p-5 transition hover:bg-white/7"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + index * 0.03, duration: 0.2 }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">Rule {result.rule.id}</span>
                        <StatusBadge value={result.status} />
                        <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-200">{result.rule.section}</Badge>
                        <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-200">{result.remediation_kind}</Badge>
                      </div>
                      <p className="mt-3 text-base font-medium text-slate-100">{result.rule.title}</p>
                      <p className="mt-3 text-sm leading-7 text-slate-400">{result.message}</p>
                      {result.affected.length > 0 ? (
                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                          Affected: {result.affected.join(', ')}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                      {result.rule.category}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      ) : null}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  suffix,
  tone = 'default',
}: {
  label: string
  value: string
  suffix: string
  tone?: 'default' | 'danger' | 'success'
}) {
  const toneClass = {
    default: 'text-white',
    danger: 'text-rose-300',
    success: 'text-emerald-300',
  }[tone]

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className={`text-4xl font-semibold ${toneClass}`}>{value}</span>
        <span className="pb-1 text-sm text-slate-500">{suffix}</span>
      </div>
    </div>
  )
}

function StatusBadge({ value }: { value: 'Pass' | 'Fail' | 'Error' }) {
  const toneClass = {
    Pass: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
    Fail: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    Error: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
  }[value]

  return <span className={`status-chip ${toneClass}`}>{value}</span>
}

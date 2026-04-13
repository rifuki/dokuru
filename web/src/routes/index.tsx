import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Shield,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react'

import { DokuruEmblem } from '@/components/brand/DokuruEmblem'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useAudit } from '@/features/audit/hooks/use-audit'
import { useHealth } from '@/features/health/hooks/use-health'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: health } = useHealth()
  const { data: report, isLoading } = useAudit(true)

  const failedRules = report?.results.filter((result) => result.status === 'Fail') ?? []
  const highlighted = report?.results.slice(0, 5) ?? []
  const daemonRules = report?.results.filter((result) => result.rule.section === 'Daemon') ?? []
  const runtimeRules = report?.results.filter((result) => result.rule.section !== 'Daemon') ?? []

  return (
    <div className="space-y-6 pb-8">
      <motion.section
        className="glass-surface panel-outline relative overflow-hidden rounded-[32px] px-6 py-7 md:px-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.18),transparent_34%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="section-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              Host Security Overview
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Docker hardening, made visible.
              </h2>
            </div>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
              Dokuru combines CIS Docker auditing, guided remediation, and runtime visibility into one lightweight console for VPS and self-hosted Docker hosts.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/audit"
                className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#38BDF8,#6366F1)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(56,189,248,0.25)] transition hover:translate-y-[-1px]"
              >
                Run live audit
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/fix"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open remediation hub
                <Wrench className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-3 text-sm text-slate-300">
              <StatusPill tone={health?.docker_connected ? 'ok' : 'danger'}>
                {health?.docker_connected ? `Docker Engine ${health.docker_version}` : 'Docker disconnected'}
              </StatusPill>
              <StatusPill tone="neutral">
                {report ? `${report.hostname} • ${report.total_containers} containers` : 'Awaiting host telemetry'}
              </StatusPill>
            </div>
          </div>

          <div className="metric-highlight panel-outline rounded-[28px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-sky-200/80">Security score</p>
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-6xl font-semibold text-white">{report?.score ?? '--'}</span>
                  <span className="pb-2 text-lg text-slate-400">/ 100</span>
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-slate-950/40 p-3">
                <DokuruEmblem className="h-14 w-14" />
              </div>
            </div>

            <div className="mt-6">
              <Progress value={report?.score ?? 0} className="h-2.5 bg-white/10 [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,#38BDF8,#6366F1)]" />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <MetricMini label="Passed" value={report?.passed ?? 0} tone="success" />
              <MetricMini label="Failed" value={report?.failed ?? 0} tone="danger" />
              <MetricMini label="Daemon rules" value={daemonRules.length} tone="info" />
            </div>
          </div>
        </div>
      </motion.section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <motion.div className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.28 }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Risk focus</p>
              <p className="mt-2 text-sm leading-7 text-slate-400">What needs attention right now across daemon and runtime controls.</p>
            </div>
            <Badge variant="outline" className="border-white/10 bg-white/8 px-3 py-1 text-slate-100">Live posture</Badge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard
              icon={<ShieldAlert className="h-5 w-5 text-rose-300" />}
              title="Open remediations"
              value={failedRules.length}
              description={failedRules.length > 0 ? 'Controls currently failing CIS checks' : 'No failing controls detected'}
              tone="danger"
            />
            <MetricCard
              icon={<Shield className="h-5 w-5 text-sky-300" />}
              title="Daemon coverage"
              value={daemonRules.length}
              description="Docker daemon and host-facing controls"
              tone="info"
            />
            <MetricCard
              icon={<Cpu className="h-5 w-5 text-emerald-300" />}
              title="Runtime coverage"
              value={runtimeRules.length}
              description="Container runtime and cgroup isolation rules"
              tone="success"
            />
          </div>
        </motion.div>

        <motion.div className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.28 }}>
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-sky-200">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-200">Host telemetry</p>
              <p className="text-sm text-slate-400">Identity and runtime state from the active Docker host.</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <TelemetryRow label="Hostname" value={report?.hostname ?? 'Loading...'} />
            <TelemetryRow label="Docker version" value={report?.docker_version ? `v${report.docker_version}` : 'Loading...'} />
            <TelemetryRow label="Rules evaluated" value={report ? String(report.results.length) : 'Loading...'} />
            <TelemetryRow label="Last audit" value={report?.timestamp ? formatRelative(report.timestamp) : isLoading ? 'Running...' : 'Not yet available'} />
          </div>
        </motion.div>
      </section>

      <motion.section className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.28 }}>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-lg font-semibold text-white">Signal timeline</p>
            <p className="mt-2 text-sm leading-7 text-slate-400">Recent rule outcomes with the strongest operator impact surfaced first.</p>
          </div>
          <Link to="/report" className="inline-flex items-center gap-2 text-sm font-medium text-sky-200 transition hover:text-white">
            Open executive report
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {highlighted.length > 0 ? (
          <div className="mt-6 space-y-3">
            {highlighted.map((result, index) => (
              <motion.div
                key={`${result.rule.id}-${result.status}`}
                className="rounded-[24px] border border-white/8 bg-white/4 p-4 transition hover:bg-white/7"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 + index * 0.05, duration: 0.24 }}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">Rule {result.rule.id}</span>
                      <StatusPill tone={statusTone(result.status)}>{result.status}</StatusPill>
                      <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-200">{result.rule.section}</Badge>
                    </div>
                    <p className="mt-3 text-base font-medium text-slate-100">{result.rule.title}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-400">{result.message}</p>
                    {result.affected.length > 0 ? (
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                        Affected: {result.affected.join(', ')}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                    {result.remediation_kind}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="mt-8 flex items-center gap-3 rounded-[24px] border border-white/8 bg-white/5 px-5 py-6 text-slate-400">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            Audit data is still loading. Once available, the newest CIS signals will appear here.
          </div>
        )}
      </motion.section>
    </div>
  )
}

function MetricCard({
  icon,
  title,
  value,
  description,
  tone,
}: {
  icon: React.ReactNode
  title: string
  value: number
  description: string
  tone: 'success' | 'danger' | 'info'
}) {
  const toneClass = {
    success: 'from-emerald-400/12 to-transparent text-emerald-100',
    danger: 'from-rose-400/12 to-transparent text-rose-100',
    info: 'from-sky-400/12 to-transparent text-sky-100',
  }[tone]

  return (
    <div className={`rounded-[24px] border border-white/8 bg-gradient-to-br ${toneClass} p-5`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-300">{title}</p>
          <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">{icon}</div>
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-400">{description}</p>
    </div>
  )
}

function MetricMini({ label, value, tone }: { label: string; value: number; tone: 'success' | 'danger' | 'info' }) {
  const toneClass = {
    success: 'text-emerald-300',
    danger: 'text-rose-300',
    info: 'text-sky-300',
  }[tone]

  return (
    <div className="rounded-[22px] border border-white/8 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

function TelemetryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-100">{value}</span>
    </div>
  )
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'danger' | 'neutral' | 'Pass' | 'Fail' | 'Error' }) {
  const toneClass = {
    ok: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
    danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    neutral: 'border-white/10 bg-white/8 text-slate-200',
    Pass: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
    Fail: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    Error: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
  }[tone]

  return <span className={`status-chip ${toneClass}`}>{children}</span>
}

function statusTone(status: 'Pass' | 'Fail' | 'Error') {
  return status
}

function formatRelative(timestamp: string) {
  const value = new Date(timestamp)
  return value.toLocaleString()
}

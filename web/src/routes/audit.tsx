import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, CheckCircle2, Play, Shield, ShieldAlert, TrendingUp, XCircle, ChevronDown, ChevronUp, Info, Terminal, BookOpen } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAudit } from '@/features/audit/hooks/use-audit'
import type { CheckResult, Severity } from '@/types/dokuru'

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})

function AuditPage() {
  const { data: report, isLoading, refetch, isFetching } = useAudit(false)
  const loading = isLoading || isFetching

  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())

  const failing = report?.results.filter((result) => result.status === 'Fail') ?? []
  const healthy = report?.results.filter((result) => result.status === 'Pass') ?? []
  const errors = report?.results.filter((result) => result.status === 'Error') ?? []

  // Severity breakdown
  const critical = failing.filter((r) => r.rule.severity === 'High').length
  const medium = failing.filter((r) => r.rule.severity === 'Medium').length
  const low = failing.filter((r) => r.rule.severity === 'Low').length

  // Filter results
  const filteredFailing = severityFilter === 'all' 
    ? failing 
    : failing.filter((r) => r.rule.severity === severityFilter)

  const score = report?.score ?? 0
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400'
  const scoreRingColor = score >= 80 ? 'stroke-emerald-400' : score >= 50 ? 'stroke-amber-400' : 'stroke-rose-400'

  const toggleExpand = (ruleId: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) {
        next.delete(ruleId)
      } else {
        next.add(ruleId)
      }
      return next
    })
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="glass-surface panel-outline rounded-md px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="section-kicker">
              <Shield className="h-3.5 w-3.5" />
              CIS Audit Engine
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">Security Audit</h2>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => refetch()}
              disabled={loading}
              className="rounded bg-zinc-200 px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-300"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-950/40 border-t-transparent animate-spin" />
                  Scanning...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Run audit
                </span>
              )}
            </Button>
            <Link
              to="/fix"
              className="inline-flex items-center gap-2 rounded border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Remediation
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Score & Stats Dashboard */}
      {report ? (
        <section className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* Score Ring */}
          <div className="neo-card p-6">
            <div className="flex flex-col items-center">
              <div className="relative h-48 w-48">
                <svg className="h-full w-full -rotate-90 transform">
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-white/10"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${(score / 100) * 553} 553`}
                    className={`${scoreRingColor} transition-all duration-1000`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-5xl font-bold ${scoreColor}`}>{score}</span>
                  <span className="text-sm text-slate-400">/ 100</span>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-lg font-semibold text-white">Security Score</p>
                <div className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-400">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span>+5 from last scan</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Passing"
              value={healthy.length}
              total={report.results.length}
              color="emerald"
            />
            <StatCard
              icon={<XCircle className="h-5 w-5" />}
              label="Failing"
              value={failing.length}
              total={report.results.length}
              color="rose"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5" />}
              label="Errors"
              value={errors.length}
              total={report.results.length}
              color="amber"
            />
            <SeverityCard 
              label="Critical" 
              value={critical} 
              color="rose" 
              active={severityFilter === 'High'}
              onClick={() => setSeverityFilter(severityFilter === 'High' ? 'all' : 'High')}
            />
            <SeverityCard 
              label="Medium" 
              value={medium} 
              color="amber"
              active={severityFilter === 'Medium'}
              onClick={() => setSeverityFilter(severityFilter === 'Medium' ? 'all' : 'Medium')}
            />
            <SeverityCard 
              label="Low" 
              value={low} 
              color="slate"
              active={severityFilter === 'Low'}
              onClick={() => setSeverityFilter(severityFilter === 'Low' ? 'all' : 'Low')}
            />
          </div>
        </section>
      ) : null}

      {!report && !loading ? (
        <section className="neo-card p-8">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full border border-white/10 bg-white/6 p-6 text-sky-200">
              <Shield className="h-12 w-12" />
            </div>
            <h3 className="mt-6 text-2xl font-semibold text-white">No audit data</h3>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              Run your first security audit to analyze Docker daemon configuration and container runtime security.
            </p>
            <Button
              onClick={() => refetch()}
              className="mt-6 rounded bg-zinc-200 px-6 py-2.5 text-sm font-semibold text-black hover:bg-zinc-300"
            >
              <Play className="mr-2 h-4 w-4" />
              Start audit
            </Button>
          </div>
        </section>
      ) : null}

      {loading && !report ? (
        <section className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => index).map((index) => (
            <div key={index} className="neo-card p-5">
              <div className="h-5 w-32 animate-pulse rounded-full bg-white/10" />
              <div className="mt-4 h-10 w-20 animate-pulse rounded-full bg-white/10" />
            </div>
          ))}
        </section>
      ) : null}

      {/* Issues Section */}
      {report && filteredFailing.length > 0 ? (
        <section className="neo-card p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-rose-400/16 bg-rose-400/10 p-2.5 text-rose-200">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-semibold text-white">Security Issues</p>
                <p className="text-sm text-slate-400">
                  {severityFilter === 'all' 
                    ? `${filteredFailing.length} controls need attention` 
                    : `${filteredFailing.length} ${severityFilter} severity issues`}
                </p>
              </div>
            </div>
            {severityFilter !== 'all' && (
              <Button
                onClick={() => setSeverityFilter('all')}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Clear filter
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {filteredFailing.map((result) => (
              <IssueCard
                key={result.rule.id}
                result={result}
                expanded={expandedRules.has(result.rule.id)}
                onToggle={() => toggleExpand(result.rule.id)}
              />
            ))}
          </div>
        </section>
      ) : report && failing.length === 0 ? (
        <section className="neo-card p-8">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 p-6 text-emerald-400">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h3 className="mt-6 text-2xl font-semibold text-white">All Clear!</h3>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              No security issues detected. Your Docker environment is compliant with CIS benchmarks.
            </p>
          </div>
        </section>
      ) : null}

      {/* All Results */}
      {report && report.results.length > 0 ? (
        <section className="neo-card p-5">
          <div className="mb-6">
            <p className="text-lg font-semibold text-white">Complete Audit Results</p>
            <p className="mt-1 text-sm text-slate-400">
              {report.results.length} rules evaluated • {healthy.length} passed • {failing.length} failed • {errors.length} errors
            </p>
          </div>

          <div className="space-y-3">
            {report.results.map((result) => (
              <ResultCard
                key={`${result.rule.id}-${result.status}`}
                result={result}
                expanded={expandedRules.has(`all-${result.rule.id}`)}
                onToggle={() => toggleExpand(`all-${result.rule.id}`)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function IssueCard({ result, expanded, onToggle }: { result: CheckResult; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-rose-400/12 bg-rose-400/6 transition hover:border-rose-400/20">
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white">Rule {result.rule.id}</span>
              <StatusBadge value={result.status} />
              <Badge variant="outline" className="border-rose-400/20 bg-rose-400/10 text-rose-200">
                {result.rule.severity}
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-300">
                {result.rule.section}
              </Badge>
            </div>
            <p className="text-base font-medium text-slate-100">{result.rule.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{result.message}</p>
            {result.affected.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.affected.map((item) => (
                  <span key={item} className="rounded bg-rose-400/10 px-2 py-1 text-xs text-rose-200">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button className="text-slate-400 hover:text-white transition">
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-rose-400/12 bg-rose-400/4 p-4 space-y-4">
          <DetailSection
            icon={<Info className="h-4 w-4" />}
            title="Description"
            content={result.rule.description}
          />
          <DetailSection
            icon={<BookOpen className="h-4 w-4" />}
            title="Remediation"
            content={result.rule.remediation}
          />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-medium text-white">CIS Reference</span>
            </div>
            <div className="rounded bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              CIS Docker Benchmark v1.8.0 - Rule {result.rule.id}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultCard({ result, expanded, onToggle }: { result: CheckResult; expanded: boolean; onToggle: () => void }) {
  const statusColor = result.status === 'Pass' ? 'border-white/8 bg-white/4' : result.status === 'Fail' ? 'border-rose-400/12 bg-rose-400/6' : 'border-amber-400/12 bg-amber-400/6'
  
  return (
    <div className={`rounded-lg border transition hover:border-white/12 ${statusColor}`}>
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white">Rule {result.rule.id}</span>
              <StatusBadge value={result.status} />
              <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-200">
                {result.rule.severity}
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-200">
                {result.remediation_kind}
              </Badge>
            </div>
            <p className="text-base font-medium text-slate-100">{result.rule.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{result.message}</p>
            {result.affected.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.affected.map((item) => (
                  <span key={item} className="rounded bg-white/8 px-2 py-1 text-xs text-slate-300">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-white/8 bg-slate-950/50 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-slate-300">
              {result.rule.category}
            </div>
            <button className="text-slate-400 hover:text-white transition">
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/8 bg-white/2 p-4 space-y-4">
          <DetailSection
            icon={<Info className="h-4 w-4" />}
            title="Description"
            content={result.rule.description}
          />
          <DetailSection
            icon={<BookOpen className="h-4 w-4" />}
            title="Remediation"
            content={result.rule.remediation}
          />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-medium text-white">CIS Reference</span>
            </div>
            <div className="rounded bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              CIS Docker Benchmark v1.8.0 - Rule {result.rule.id}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailSection({ icon, title, content }: { icon: React.ReactNode; title: string; content: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sky-400">{icon}</span>
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <p className="text-sm leading-6 text-slate-300 whitespace-pre-wrap">{content}</p>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  total: number
  color: 'emerald' | 'rose' | 'amber'
}) {
  const percentage = Math.round((value / total) * 100)
  const colorClasses = {
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  }

  return (
    <div className="neo-card p-4">
      <div className="flex items-center gap-3">
        <span className={`rounded-md border p-2 ${colorClasses[color]}`}>{icon}</span>
        <div className="flex-1">
          <p className="text-sm text-slate-400">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{value}</span>
            <span className="text-sm text-slate-500">/ {total}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold text-white">{percentage}%</span>
        </div>
      </div>
    </div>
  )
}

function SeverityCard({ 
  label, 
  value, 
  color,
  active,
  onClick 
}: { 
  label: string
  value: number
  color: 'rose' | 'amber' | 'slate'
  active?: boolean
  onClick?: () => void
}) {
  const colorClasses = {
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    slate: 'border-slate-400/20 bg-slate-400/10 text-slate-200',
  }

  return (
    <div 
      className={`neo-card p-4 cursor-pointer transition-all ${active ? 'ring-2 ring-sky-400/50' : 'hover:bg-white/8'}`}
      onClick={onClick}
    >
      <p className="text-sm text-slate-400">{label} Severity</p>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-3xl font-bold text-white">{value}</span>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${colorClasses[color]}`}>
          {label.toUpperCase()}
        </span>
      </div>
      {active && (
        <p className="mt-2 text-xs text-sky-400">Click to clear filter</p>
      )}
    </div>
  )
}

function StatusBadge({ value }: { value: 'Pass' | 'Fail' | 'Error' }) {
  const toneClass = {
    Pass: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
    Fail: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    Error: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
  }[value]

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClass}`}>
      {value}
    </span>
  )
}

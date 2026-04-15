import { createFileRoute } from '@tanstack/react-router'
import { Play, Shield, ChevronDown, Terminal, BookOpen, ExternalLink, Zap, RotateCcw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { useState } from 'react'

import { useAudit } from '@/features/audit/hooks/use-audit'
import { useApplyFix } from '@/features/fix/hooks/use-apply-fix'
import type { CheckResult, FixOutcome, Severity } from '@/types/dokuru'

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})

function AuditPage() {
  const { data: report, isLoading, refetch, isFetching } = useAudit(false)
  const loading = isLoading || isFetching

  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const failing = report?.results.filter((r) => r.status === 'Fail') ?? []
  const passing = report?.results.filter((r) => r.status === 'Pass') ?? []
  const errors  = report?.results.filter((r) => r.status === 'Error') ?? []

  const critical = failing.filter((r) => r.rule.severity === 'High').length
  const medium   = failing.filter((r) => r.rule.severity === 'Medium').length
  const low      = failing.filter((r) => r.rule.severity === 'Low').length

  const filteredFailing = severityFilter === 'all'
    ? failing
    : failing.filter((r) => r.rule.severity === severityFilter)

  const score = report?.score ?? 0
  const total = report?.results.length ?? 0

  const toggle = (id: string) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">

      {/* ── Header ── */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-zinc-500 mb-2">CIS Benchmark v1.8.0</p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Security Audit</h1>
          {report && (
            <p className="mt-1 text-sm text-zinc-500">
              Last scan — {new Date(report.timestamp).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="inline-flex items-center gap-2 h-8 px-3 rounded text-xs font-medium bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading
            ? <><Spinner /> Scanning…</>
            : <><Play className="h-3 w-3" /> Run audit</>}
        </button>
      </div>

      {/* ── Score strip ── */}
      {report && (
        <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
          <div className="flex items-center gap-8 px-5 py-4">
            <div className="shrink-0">
              <span className={`text-5xl font-bold font-mono tabular-nums ${scoreColor(score)}`}>{score}</span>
              <span className="text-zinc-500 text-sm ml-1.5">/ 100</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-zinc-500">Security score</span>
              </div>
              <div className="h-1 w-full bg-white/[0.07] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${scoreBar(score)}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-white/[0.07]">
            <StatCell icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Passing" value={passing.length} total={total} accent="text-emerald-400" />
            <StatCell icon={<XCircle className="h-3.5 w-3.5" />}      label="Failing"  value={failing.length}  total={total} accent="text-rose-400"    />
            <StatCell icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Errors"   value={errors.length}   total={total} accent="text-amber-400"   />
          </div>

          <div className="flex divide-x divide-white/[0.07]">
            {([
              { label: 'Critical', key: 'High'   as Severity, count: critical, color: 'text-rose-400'  },
              { label: 'Medium',   key: 'Medium' as Severity, count: medium,   color: 'text-amber-400' },
              { label: 'Low',      key: 'Low'    as Severity, count: low,      color: 'text-zinc-400'  },
            ] as { label: string; key: Severity; count: number; color: string }[]).map(({ label, key, count, color }) => (
              <button
                key={key}
                onClick={() => setSeverityFilter(severityFilter === key ? 'all' : key)}
                className={`flex-1 flex items-center justify-between px-5 py-3 text-xs transition-colors cursor-pointer ${severityFilter === key ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}
              >
                <span className="text-zinc-500">{label}</span>
                <span className={`font-mono font-semibold ${color}`}>{count}</span>
              </button>
            ))}
            {severityFilter !== 'all' && (
              <button onClick={() => setSeverityFilter('all')} className="px-4 py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Empty / loading states ── */}
      {!report && !loading && (
        <div className="border border-white/[0.07] rounded-sm px-6 py-16 flex flex-col items-center gap-4 text-center">
          <Shield className="h-8 w-8 text-zinc-600" />
          <div>
            <p className="text-sm font-medium text-white">No audit data</p>
            <p className="mt-1 text-xs text-zinc-500">Run a scan to analyze your Docker security posture.</p>
          </div>
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer">
            <Play className="h-3 w-3" /> Start audit
          </button>
        </div>
      )}

      {loading && !report && (
        <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4">
              <div className="h-1.5 w-1.5 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: `${120 + i * 25}px` }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Failing issues ── */}
      {report && filteredFailing.length > 0 && (
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500 mb-3">
            Issues · {filteredFailing.length}
          </p>
          <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
            {filteredFailing.map((r) => (
              <IssueRow key={r.rule.id} result={r} expanded={expanded.has(r.rule.id)} onToggle={() => toggle(r.rule.id)} />
            ))}
          </div>
        </div>
      )}

      {/* ── All results ── */}
      {report && total > 0 && (
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500 mb-3">
            All Rules · {total}
          </p>
          <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
            {report.results.map((r) => (
              <ResultRow key={r.rule.id} result={r} expanded={expanded.has(`all-${r.rule.id}`)} onToggle={() => toggle(`all-${r.rule.id}`)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Issue row (failing) ───────────────────────────────────────────────────────

function IssueRow({ result, expanded, onToggle }: { result: CheckResult; expanded: boolean; onToggle: () => void }) {
  const { mutateAsync: applyFix, isPending } = useApplyFix()
  const [outcome, setOutcome] = useState<FixOutcome | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const handleFix = async (ruleId: string) => {
    setApplyingId(ruleId)
    try {
      const result = await applyFix(ruleId)
      setOutcome(result)
    } finally {
      setApplyingId(null)
    }
  }

  const sevDot = result.rule.severity === 'High' ? 'bg-rose-500' : result.rule.severity === 'Medium' ? 'bg-amber-500' : 'bg-zinc-500'

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={onToggle}>
        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${sevDot}`} />
        <span className="shrink-0 font-mono text-xs text-zinc-500 w-14">{result.rule.id}</span>
        <span className="flex-1 text-sm text-zinc-200 truncate">{result.rule.title}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <MTag>{result.rule.severity}</MTag>
          <MTag muted>{result.rule.section}</MTag>
          <MTag muted>{result.remediation_kind}</MTag>
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition-transform ml-1 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.07] divide-y divide-white/[0.07]">

          {/* Evidence */}
          {(result.audit_command || result.raw_output) && (
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">Evidence</p>
              {result.audit_command && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
                    <Terminal className="h-3 w-3" /> Audit command
                  </p>
                  <pre className="bg-black/40 border border-white/[0.06] rounded-sm px-3 py-2.5 text-xs font-mono text-zinc-300 overflow-x-auto">
                    {result.audit_command}
                  </pre>
                </div>
              )}
              {result.raw_output && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
                    <Terminal className="h-3 w-3" /> Output
                  </p>
                  <pre className="bg-black/40 border border-white/[0.06] rounded-sm px-3 py-2.5 text-xs font-mono text-zinc-400 overflow-x-auto max-h-40 overflow-y-auto">
                    {result.raw_output}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Finding */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">Finding</p>
            <p className="text-sm text-zinc-300">{result.message}</p>
            {result.affected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.affected.map((item) => (
                  <code key={item} className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] text-xs font-mono text-zinc-300">{item}</code>
                ))}
              </div>
            )}
          </div>

          {/* Fix */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">Remediation</p>
            <p className="text-sm text-zinc-400 leading-relaxed">{result.rule.remediation}</p>
            <div className="flex gap-2 pt-1">
              <button
                disabled={result.remediation_kind !== 'auto' || isPending}
                onClick={() => handleFix(result.rule.id)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium border transition-colors ${
                  result.remediation_kind === 'auto'
                    ? 'border-emerald-500/25 bg-emerald-500/[0.1] text-emerald-400 hover:bg-emerald-500/[0.18] cursor-pointer'
                    : 'border-white/[0.07] text-zinc-600 cursor-not-allowed opacity-40'
                }`}
              >
                {applyingId === result.rule.id ? <Spinner /> : <Zap className="h-3 w-3" />}
                Auto Fix
              </button>
              <button
                disabled={result.remediation_kind === 'manual'}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium border transition-colors ${
                  result.remediation_kind !== 'manual'
                    ? 'border-sky-500/25 bg-sky-500/[0.1] text-sky-400 hover:bg-sky-500/[0.18] cursor-pointer'
                    : 'border-white/[0.07] text-zinc-600 cursor-not-allowed opacity-40'
                }`}
              >
                <BookOpen className="h-3 w-3" /> Guided Fix
              </button>
              <button className="inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium border border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07] transition-colors cursor-pointer">
                <Terminal className="h-3 w-3" /> Manual Steps
              </button>
            </div>

            {/* Outcome */}
            {outcome && (
              <div className={`mt-2 rounded-sm border px-3 py-2.5 text-xs ${
                outcome.status === 'applied'
                  ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
                  : outcome.status === 'blocked'
                  ? 'border-rose-500/20 bg-rose-500/[0.07] text-rose-400'
                  : 'border-sky-500/20 bg-sky-500/[0.07] text-sky-400'
              }`}>
                <span className="font-mono uppercase tracking-wider mr-2">{outcome.status}</span>
                {outcome.message}
                {outcome.restart_command && (
                  <div className="mt-1.5 font-mono text-zinc-400">Next: {outcome.restart_command}</div>
                )}
              </div>
            )}
          </div>

          {/* CIS refs */}
          <div className="px-5 py-3 flex items-center gap-4">
            {[
              { label: 'CIS Benchmark', href: 'https://www.cisecurity.org/benchmark/docker' },
              { label: 'Docker Security', href: 'https://docs.docker.com/engine/security/' },
            ].map(({ label, href }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                {label} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Result row (all rules) ────────────────────────────────────────────────────

function ResultRow({ result, expanded, onToggle }: { result: CheckResult; expanded: boolean; onToggle: () => void }) {
  const dot = result.status === 'Pass' ? 'bg-emerald-500' : result.status === 'Fail' ? 'bg-rose-500' : 'bg-amber-500'
  const statusText = result.status === 'Pass' ? 'text-emerald-500' : result.status === 'Fail' ? 'text-rose-500' : 'text-amber-500'

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={onToggle}>
        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="shrink-0 font-mono text-xs text-zinc-500 w-14">{result.rule.id}</span>
        <span className="flex-1 text-sm text-zinc-300 truncate">{result.rule.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <MTag muted>{result.rule.section}</MTag>
          <span className={`font-mono text-xs ${statusText}`}>{result.status}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition-transform ml-1 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.07] divide-y divide-white/[0.07]">
          {/* Evidence */}
          {(result.audit_command || result.raw_output) && (
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">Evidence</p>
              {result.audit_command && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5"><Terminal className="h-3 w-3" /> Audit command</p>
                  <pre className="bg-black/40 border border-white/[0.06] rounded-sm px-3 py-2.5 text-xs font-mono text-zinc-300 overflow-x-auto">
                    {result.audit_command}
                  </pre>
                </div>
              )}
              {result.raw_output && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5"><Terminal className="h-3 w-3" /> Output</p>
                  <pre className="bg-black/40 border border-white/[0.06] rounded-sm px-3 py-2.5 text-xs font-mono text-zinc-400 overflow-x-auto max-h-40 overflow-y-auto">
                    {result.raw_output}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-4 space-y-2">
            <p className="text-xs text-zinc-500 mb-1">Message</p>
            <p className="text-sm text-zinc-300">{result.message}</p>
            {result.affected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {result.affected.map((item) => (
                  <code key={item} className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] text-xs font-mono text-zinc-300">{item}</code>
                ))}
              </div>
            )}
            {result.rule.description && (
              <div className="pt-2">
                <p className="text-xs text-zinc-500 mb-1">Description</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{result.rule.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Micro components ──────────────────────────────────────────────────────────

function StatCell({ icon, label, value, total, accent }: { icon: React.ReactNode; label: string; value: number; total: number; accent: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums ${accent}`}>{value}</span>
        <span className="text-xs text-zinc-600">/ {total}</span>
        <span className="ml-auto text-xs font-mono text-zinc-600">{pct}%</span>
      </div>
    </div>
  )
}

function MTag({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border ${muted ? 'border-white/[0.07] text-zinc-600' : 'border-white/[0.1] text-zinc-400'}`}>
      {children}
    </span>
  )
}

function Spinner() {
  return <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />
}

function scoreColor(s: number) {
  return s >= 80 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-rose-400'
}

function scoreBar(s: number) {
  return s >= 80 ? 'bg-emerald-400' : s >= 50 ? 'bg-amber-400' : 'bg-rose-400'
}

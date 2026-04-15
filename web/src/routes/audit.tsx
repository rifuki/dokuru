import { createFileRoute } from '@tanstack/react-router'
import { Play, Shield, ChevronDown, Terminal, BookOpen, ExternalLink, Zap, RotateCcw } from 'lucide-react'
import { useState } from 'react'

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

  const toggleExpand = (id: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

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
            ? <><span className="h-3 w-3 rounded-full border border-black/30 border-t-transparent animate-spin" /> Scanning…</>
            : <><Play className="h-3 w-3" /> Run audit</>
          }
        </button>
      </div>

      {/* ── Score strip ── */}
      {report && (
        <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
          {/* Score row */}
          <div className="flex items-center gap-8 px-5 py-4">
            <div className="shrink-0">
              <span className={`text-5xl font-bold font-mono tabular-nums ${
                score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400'
              }`}>{score}</span>
              <span className="text-zinc-500 text-sm ml-1.5">/ 100</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-zinc-500">Security score</span>
              </div>
              <div className="h-1 w-full bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    score >= 80 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 divide-x divide-white/[0.07]">
            <StatCell label="Passing" value={passing.length} total={total} accent="text-emerald-400" />
            <StatCell label="Failing"  value={failing.length}  total={total} accent="text-rose-400"    />
            <StatCell label="Errors"   value={errors.length}   total={total} accent="text-amber-400"   />
          </div>

          {/* Severity filter row */}
          <div className="flex items-center gap-0 divide-x divide-white/[0.07]">
            {(
              [
                { label: 'Critical', key: 'High' as Severity, count: critical, color: 'text-rose-400' },
                { label: 'Medium',   key: 'Medium' as Severity, count: medium,   color: 'text-amber-400' },
                { label: 'Low',      key: 'Low' as Severity,    count: low,      color: 'text-zinc-400' },
              ] as { label: string; key: Severity; count: number; color: string }[]
            ).map(({ label, key, count, color }) => (
              <button
                key={key}
                onClick={() => setSeverityFilter(severityFilter === key ? 'all' : key)}
                className={`flex-1 flex items-center justify-between px-5 py-3 text-xs transition-colors cursor-pointer ${
                  severityFilter === key ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}
              >
                <span className="text-zinc-500">{label}</span>
                <span className={`font-mono font-semibold ${color}`}>{count}</span>
              </button>
            ))}
            {severityFilter !== 'all' && (
              <button
                onClick={() => setSeverityFilter('all')}
                className="px-4 py-3 text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
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
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            <Play className="h-3 w-3" /> Start audit
          </button>
        </div>
      )}

      {loading && !report && (
        <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4">
              <div className="h-2 w-2 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: `${140 + i * 30}px` }} />
              <div className="ml-auto h-3 w-12 rounded bg-white/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* ── Failing issues ── */}
      {report && filteredFailing.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono uppercase tracking-[0.1em] text-zinc-500">
              Issues · {filteredFailing.length}
            </p>
          </div>
          <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
            {filteredFailing.map((r) => (
              <IssueRow
                key={r.rule.id}
                result={r}
                expanded={expandedRules.has(r.rule.id)}
                onToggle={() => toggleExpand(r.rule.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── All results ── */}
      {report && report.results.length > 0 && (
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.1em] text-zinc-500 mb-3">
            All Rules · {total}
          </p>
          <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
            {report.results.map((r) => (
              <ResultRow
                key={r.rule.id}
                result={r}
                expanded={expandedRules.has(`all-${r.rule.id}`)}
                onToggle={() => toggleExpand(`all-${r.rule.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Issue row (failing only) ──────────────────────────────────────────────────

function IssueRow({ result, expanded, onToggle }: { result: CheckResult; expanded: boolean; onToggle: () => void }) {
  const severityColor = result.rule.severity === 'High' ? 'bg-rose-500' : result.rule.severity === 'Medium' ? 'bg-amber-500' : 'bg-zinc-500'

  return (
    <div className="group">
      <div
        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        {/* severity dot */}
        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${severityColor}`} />

        {/* rule id */}
        <span className="shrink-0 font-mono text-xs text-zinc-500 w-16">
          {result.rule.id}
        </span>

        {/* title */}
        <span className="flex-1 text-sm text-zinc-200 truncate">{result.rule.title}</span>

        {/* meta */}
        <div className="flex items-center gap-2 shrink-0">
          <Tag>{result.rule.severity}</Tag>
          <Tag muted>{result.rule.section}</Tag>
          <Tag muted>{result.remediation_kind}</Tag>
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.07] bg-white/[0.015] px-5 py-4 space-y-5">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Message</p>
            <p className="text-sm text-zinc-300">{result.message}</p>
          </div>

          {result.affected.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Affected</p>
              <div className="flex flex-wrap gap-1.5">
                {result.affected.map((item) => (
                  <code key={item} className="px-2 py-0.5 rounded bg-white/[0.06] text-xs font-mono text-zinc-300">{item}</code>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">Quick fix</p>
            <div className="flex gap-2">
              <ActionBtn
                icon={<Zap className="h-3 w-3" />}
                label="Auto Fix"
                disabled={result.remediation_kind !== 'auto'}
                variant="green"
              />
              <ActionBtn
                icon={<BookOpen className="h-3 w-3" />}
                label="Guided Fix"
                disabled={result.remediation_kind === 'manual'}
                variant="blue"
              />
              <ActionBtn
                icon={<Terminal className="h-3 w-3" />}
                label="Manual Steps"
                disabled={false}
                variant="default"
              />
            </div>
          </div>

          {result.rule.description && (
            <DetailBlock label="Description" content={result.rule.description} />
          )}
          {result.rule.remediation && (
            <DetailBlock label="Remediation" content={result.rule.remediation} />
          )}

          <div className="flex gap-2">
            {[
              { label: 'CIS Benchmark', href: 'https://www.cisecurity.org/benchmark/docker' },
              { label: 'Docker Security', href: 'https://docs.docker.com/engine/security/' },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
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
  const statusDot = result.status === 'Pass'
    ? 'bg-emerald-500'
    : result.status === 'Fail'
    ? 'bg-rose-500'
    : 'bg-amber-500'

  return (
    <div className="group">
      <div
        className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${statusDot}`} />
        <span className="shrink-0 font-mono text-xs text-zinc-500 w-16">{result.rule.id}</span>
        <span className="flex-1 text-sm text-zinc-300 truncate">{result.rule.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Tag muted>{result.rule.section}</Tag>
          <span className={`font-mono text-xs ${
            result.status === 'Pass' ? 'text-emerald-500' : result.status === 'Fail' ? 'text-rose-500' : 'text-amber-500'
          }`}>
            {result.status}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.07] bg-white/[0.015] px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Message</p>
            <p className="text-sm text-zinc-300">{result.message}</p>
          </div>
          {result.affected.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Affected</p>
              <div className="flex flex-wrap gap-1.5">
                {result.affected.map((item) => (
                  <code key={item} className="px-2 py-0.5 rounded bg-white/[0.06] text-xs font-mono text-zinc-300">{item}</code>
                ))}
              </div>
            </div>
          )}
          {result.rule.description && <DetailBlock label="Description" content={result.rule.description} />}
          {result.rule.remediation && <DetailBlock label="Remediation" content={result.rule.remediation} />}
        </div>
      )}
    </div>
  )
}

// ── Micro components ──────────────────────────────────────────────────────────

function StatCell({ label, value, total, accent }: { label: string; value: number; total: number; accent: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="px-5 py-3.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums ${accent}`}>{value}</span>
        <span className="text-xs text-zinc-600">/ {total}</span>
        <span className="ml-auto text-xs font-mono text-zinc-500">{pct}%</span>
      </div>
    </div>
  )
}

function Tag({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border ${
      muted
        ? 'border-white/[0.07] text-zinc-600'
        : 'border-white/[0.1] text-zinc-400'
    }`}>
      {children}
    </span>
  )
}

function ActionBtn({ icon, label, disabled, variant }: {
  icon: React.ReactNode
  label: string
  disabled: boolean
  variant: 'green' | 'blue' | 'default'
}) {
  const base = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium border transition-colors'
  const styles = {
    green:   'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400 hover:bg-emerald-500/[0.14]',
    blue:    'border-sky-500/20 bg-sky-500/[0.08] text-sky-400 hover:bg-sky-500/[0.14]',
    default: 'border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07]',
  }
  return (
    <button
      disabled={disabled}
      className={`${base} ${styles[variant]} ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {icon}{label}
    </button>
  )
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1.5">{label}</p>
      <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  )
}

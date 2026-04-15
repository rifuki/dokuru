import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, Play, Shield, Terminal, ExternalLink, Wrench, Zap, BookOpen } from 'lucide-react'
import { useState } from 'react'

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

  const failing = report?.results.filter((r) => r.status === 'Fail') ?? []
  const healthy = report?.results.filter((r) => r.status === 'Pass') ?? []
  const errors = report?.results.filter((r) => r.status === 'Error') ?? []

  const critical = failing.filter((r) => r.rule.severity === 'High').length
  const medium = failing.filter((r) => r.rule.severity === 'Medium').length
  const low = failing.filter((r) => r.rule.severity === 'Low').length

  const filteredFailing = severityFilter === 'all' 
    ? failing 
    : failing.filter((r) => r.rule.severity === severityFilter)

  const toggleExpand = (ruleId: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      next.has(ruleId) ? next.delete(ruleId) : next.add(ruleId)
      return next
    })
  }

  const score = report?.score ?? 0

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Audit</h1>
          <p className="text-sm text-slate-400 mt-1">CIS Docker Benchmark v1.8.0</p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={loading}
          size="sm"
          className="bg-white text-black hover:bg-slate-200"
        >
          {loading ? (
            <>
              <span className="h-3 w-3 rounded-full border-2 border-black/40 border-t-transparent animate-spin mr-2" />
              Scanning...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run Audit
            </>
          )}
        </Button>
      </div>

      {/* Stats Bar */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatBox label="Score" value={`${score}/100`} color={score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red'} />
          <StatBox label="Pass" value={healthy.length} color="green" />
          <StatBox label="Fail" value={failing.length} color="red" />
          <StatBox label="Error" value={errors.length} color="yellow" />
          <StatBox label="Total" value={report.results.length} color="gray" />
        </div>
      )}

      {/* Severity Filters */}
      {report && failing.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Filter:</span>
          <FilterButton
            active={severityFilter === 'all'}
            onClick={() => setSeverityFilter('all')}
            label="All"
            count={failing.length}
          />
          <FilterButton
            active={severityFilter === 'High'}
            onClick={() => setSeverityFilter('High')}
            label="Critical"
            count={critical}
            color="red"
          />
          <FilterButton
            active={severityFilter === 'Medium'}
            onClick={() => setSeverityFilter('Medium')}
            label="Medium"
            count={medium}
            color="yellow"
          />
          <FilterButton
            active={severityFilter === 'Low'}
            onClick={() => setSeverityFilter('Low')}
            label="Low"
            count={low}
            color="gray"
          />
        </div>
      )}

      {/* Issues List */}
      {report && filteredFailing.length > 0 ? (
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
      ) : report && failing.length === 0 ? (
        <div className="border border-emerald-500/20 bg-emerald-500/5 rounded p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-white">All checks passed!</p>
          <p className="text-sm text-slate-400 mt-1">No security issues detected</p>
        </div>
      ) : !loading && !report ? (
        <div className="border border-white/10 rounded p-8 text-center">
          <Shield className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-lg font-semibold text-white">No audit data</p>
          <p className="text-sm text-slate-400 mt-1">Click "Run Audit" to start</p>
        </div>
      ) : null}

      {loading && !report && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-white/10 rounded p-4 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
              <div className="h-3 bg-white/10 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: 'green' | 'red' | 'yellow' | 'gray' }) {
  const colors = {
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    red: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    yellow: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    gray: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  }

  return (
    <div className={`border rounded p-3 ${colors[color]}`}>
      <div className="text-xs font-mono uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold font-mono mt-1">{value}</div>
    </div>
  )
}

function FilterButton({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: 'red' | 'yellow' | 'gray' }) {
  const colors = color ? {
    red: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    yellow: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    gray: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  }[color] : 'border-white/20 bg-white/5 text-white'

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm font-medium border transition ${
        active ? 'ring-2 ring-sky-500/50' : ''
      } ${colors} hover:bg-opacity-80`}
    >
      {label} <span className="opacity-60">({count})</span>
    </button>
  )
}

function IssueCard({ result, expanded, onToggle }: { result: CheckResult; expanded: boolean; onToggle: () => void }) {
  const severityColor = {
    High: 'border-rose-500/30 bg-rose-500/5',
    Medium: 'border-amber-500/30 bg-amber-500/5',
    Low: 'border-slate-500/30 bg-slate-500/5',
  }[result.rule.severity]

  return (
    <div className={`border rounded ${severityColor}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-semibold text-white bg-white/10 px-2 py-0.5 rounded">
                {result.rule.id}
              </span>
              <span className="text-xs font-mono text-rose-400">{result.rule.severity}</span>
              <span className="text-xs font-mono text-slate-500">{result.rule.section}</span>
            </div>
            <h3 className="text-base font-semibold text-white mb-2">{result.rule.title}</h3>
            <p className="text-sm text-slate-300">{result.message}</p>
            {result.affected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {result.affected.map((item) => (
                  <span key={item} className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded text-slate-300">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onToggle}
            className="text-slate-400 hover:text-white transition text-sm font-medium"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
          <FixButton type="auto" disabled={result.remediation_kind !== 'auto'} />
          <FixButton type="guided" disabled={result.remediation_kind === 'manual'} />
          <FixButton type="manual" />
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-white/10 bg-black/20 p-4 space-y-4">
          {/* Audit Command */}
          {result.audit_command && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4 text-sky-400" />
                <span className="text-sm font-semibold text-white">Audit Command</span>
              </div>
              <pre className="bg-black/40 border border-white/10 rounded p-3 text-xs font-mono text-slate-300 overflow-x-auto">
                {result.audit_command}
              </pre>
            </div>
          )}

          {/* Raw Output */}
          {result.raw_output && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">Command Output</span>
              </div>
              <pre className="bg-black/40 border border-white/10 rounded p-3 text-xs font-mono text-slate-300 overflow-x-auto max-h-48 overflow-y-auto">
                {result.raw_output}
              </pre>
            </div>
          )}

          {/* Description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold text-white">Description</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{result.rule.description}</p>
          </div>

          {/* Remediation */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">How to Fix</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{result.rule.remediation}</p>
          </div>

          {/* External Links */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-semibold text-white">Resources</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExternalLinkButton
                href={`https://www.cisecurity.org/benchmark/docker`}
                label="CIS Benchmark"
              />
              <ExternalLinkButton
                href={`https://docs.docker.com/engine/security/`}
                label="Docker Security"
              />
              <ExternalLinkButton
                href={`https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html`}
                label="OWASP Docker"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FixButton({ type, disabled }: { type: 'auto' | 'guided' | 'manual'; disabled?: boolean }) {
  const config = {
    auto: { icon: Zap, label: 'Auto Fix', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' },
    guided: { icon: BookOpen, label: 'Guided', color: 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20' },
    manual: { icon: Terminal, label: 'Manual', color: 'bg-slate-500/10 border-slate-500/30 text-slate-400 hover:bg-slate-500/20' },
  }[type]

  const Icon = config.icon

  return (
    <button
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition ${
        disabled ? 'opacity-40 cursor-not-allowed' : config.color
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </button>
  )
}

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-white/20 bg-white/5 text-slate-300 hover:bg-white/10 transition"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

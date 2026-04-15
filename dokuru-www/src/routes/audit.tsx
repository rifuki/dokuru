import { createFileRoute } from '@tanstack/react-router'
import {
  Play, Shield, ChevronDown, Terminal, BookOpen, ExternalLink,
  Zap, RotateCcw, CheckCircle2, XCircle, AlertTriangle,
  X, Copy, Check, ArrowUpDown,
} from 'lucide-react'
import { useState, useMemo } from 'react'

import { useAudit } from '@/features/audit/hooks/use-audit'
import { useApplyFix } from '@/features/fix/hooks/use-apply-fix'
import type { CheckResult, Severity } from '@/types/dokuru'

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})

type StatusFilter = 'all' | 'Fail' | 'Error' | 'Pass'
type SortKey = 'id' | 'severity' | 'status'

const SEV_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const STATUS_ORDER: Record<string, number> = { Fail: 0, Error: 1, Pass: 2 }

function AuditPage() {
  const { data: report, isLoading, refetch, isFetching } = useAudit(false)
  const loading = isLoading || isFetching

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const results = useMemo(() => report?.results ?? [], [report?.results])
  const total = results.length
  const passing = results.filter((r) => r.status === 'Pass').length
  const failing = results.filter((r) => r.status === 'Fail').length
  const errors  = results.filter((r) => r.status === 'Error').length
  const critical = results.filter((r) => r.status === 'Fail' && r.rule.severity === 'High').length
  const medium   = results.filter((r) => r.status === 'Fail' && r.rule.severity === 'Medium').length
  const low      = results.filter((r) => r.status === 'Fail' && r.rule.severity === 'Low').length
  const score = report?.score ?? 0

  const filtered = useMemo(() => {
    let list = [...results]
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter)
    if (severityFilter !== 'all') list = list.filter((r) => r.rule.severity === severityFilter)
    list.sort((a, b) => {
      if (sortKey === 'severity') return (SEV_ORDER[a.rule.severity] ?? 3) - (SEV_ORDER[b.rule.severity] ?? 3)
      if (sortKey === 'status')   return (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
      return a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true })
    })
    return list
  }, [results, statusFilter, severityFilter, sortKey])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        s.add(id);
      }
      return s;
    });

  const cycleSort = () =>
    setSortKey((k) => k === 'id' ? 'severity' : k === 'severity' ? 'status' : 'id')

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">

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
              <div className="h-1 w-full bg-white/[0.07] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${scoreBar(score)}`} style={{ width: `${score}%` }} />
              </div>
              <p className="text-xs text-zinc-500 mt-1.5">Security score</p>
            </div>
          </div>

          {/* Status stats */}
          <div className="grid grid-cols-3 divide-x divide-white/[0.07]">
            <StatCell icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Passing" value={passing} total={total} accent="text-emerald-400"
              active={statusFilter === 'Pass'} onClick={() => setStatusFilter(statusFilter === 'Pass' ? 'all' : 'Pass')} />
            <StatCell icon={<XCircle className="h-3.5 w-3.5" />}      label="Failing"  value={failing}  total={total} accent="text-rose-400"
              active={statusFilter === 'Fail'} onClick={() => setStatusFilter(statusFilter === 'Fail' ? 'all' : 'Fail')} />
            <StatCell icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Errors"   value={errors}   total={total} accent="text-amber-400"
              active={statusFilter === 'Error'} onClick={() => setStatusFilter(statusFilter === 'Error' ? 'all' : 'Error')} />
          </div>

          {/* Severity filters */}
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
            {(statusFilter !== 'all' || severityFilter !== 'all') && (
              <button onClick={() => { setStatusFilter('all'); setSeverityFilter('all') }}
                className="px-4 py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5">
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
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4">
              <div className="h-1.5 w-1.5 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: `${120 + i * 20}px` }} />
              <div className="ml-auto h-3 w-12 rounded bg-white/[0.04] animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* ── Rule list ── */}
      {report && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">
              Rules · {filtered.length}{filtered.length !== total ? ` / ${total}` : ''}
            </p>
            <button
              onClick={cycleSort}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <ArrowUpDown className="h-3 w-3" />
              sort: {sortKey}
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="border border-white/[0.07] rounded-sm px-5 py-10 text-center text-xs text-zinc-500">
              No rules match the current filter.
            </div>
          ) : (
            <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.07]">
              {filtered.map((r) => (
                <RuleRow key={r.rule.id} result={r} expanded={expanded.has(r.rule.id)} onToggle={() => toggle(r.rule.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Rule row (unified) ────────────────────────────────────────────────────────

function RuleRow({ result, expanded, onToggle }: { result: CheckResult; expanded: boolean; onToggle: () => void }) {
  const { mutateAsync: applyFix, isPending } = useApplyFix()
  const [sheet, setSheet] = useState<'guided' | 'manual' | null>(null)

  const isFail = result.status === 'Fail'
  const dot = result.status === 'Pass' ? 'bg-emerald-500' : result.status === 'Fail' ? 'bg-rose-500' : 'bg-amber-500'
  const statusText = result.status === 'Pass' ? 'text-emerald-400' : result.status === 'Fail' ? 'text-rose-400' : 'text-amber-400'

  const handleFix = () => applyFix(result.rule.id)

  return (
    <>
      <div>
        <div
          className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={onToggle}
        >
          <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${dot}`} />
          <span className="shrink-0 font-mono text-xs text-zinc-500 w-14">{result.rule.id}</span>
          <span className="flex-1 text-sm text-zinc-200 truncate">{result.rule.title}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isFail && <MTag sev={result.rule.severity}>{result.rule.severity}</MTag>}
            <MTag muted>{result.rule.section.replace('Docker daemon configuration files', 'Files').replace('Container Runtime', 'Runtime')}</MTag>
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
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">Finding</p>
              <p className="text-sm text-zinc-300">{result.message}</p>
              {result.affected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {result.affected.map((item) => (
                    <code key={item} className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] text-xs font-mono text-zinc-300">{item}</code>
                  ))}
                </div>
              )}
              {result.rule.description && (
                <p className="text-xs text-zinc-500 leading-relaxed pt-1">{result.rule.description}</p>
              )}
            </div>

            {/* Remediation — only for Fail */}
            {isFail && (
              <div className="px-5 py-4 space-y-3">
                <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">Remediation</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{result.rule.remediation}</p>
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={result.remediation_kind !== 'auto' || isPending}
                    onClick={handleFix}
                    className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium border transition-colors ${
                      result.remediation_kind === 'auto'
                        ? 'border-emerald-500/25 bg-emerald-500/[0.1] text-emerald-400 hover:bg-emerald-500/[0.18] cursor-pointer'
                        : 'border-white/[0.07] text-zinc-600 cursor-not-allowed opacity-40'
                    }`}
                  >
                    {isPending ? <Spinner /> : <Zap className="h-3 w-3" />}
                    Auto Fix
                  </button>
                  <button
                    onClick={() => setSheet('guided')}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium border border-sky-500/25 bg-sky-500/[0.1] text-sky-400 hover:bg-sky-500/[0.18] transition-colors cursor-pointer"
                  >
                    <BookOpen className="h-3 w-3" /> Guided Fix
                  </button>
                  <button
                    onClick={() => setSheet('manual')}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium border border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07] transition-colors cursor-pointer"
                  >
                    <Terminal className="h-3 w-3" /> Manual Steps
                  </button>
                </div>
              </div>
            )}

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

      {sheet && (
        <RemediationSheet result={result} mode={sheet} onClose={() => setSheet(null)} />
      )}
    </>
  )
}

// ── Remediation sheet ─────────────────────────────────────────────────────────

function RemediationSheet({ result, mode, onClose }: { result: CheckResult; mode: 'guided' | 'manual'; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const commands = getFixCommands(result)
  const steps = getFixSteps(result)

  const handleCopy = () => {
    navigator.clipboard.writeText(commands)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[480px] shrink-0 h-full bg-[#111214] border-l border-white/[0.07] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-zinc-500 mb-1">
              {mode === 'guided' ? 'Guided Remediation' : 'Manual Steps'}
            </p>
            <h2 className="text-sm font-semibold text-white">{result.rule.id} · {result.rule.title}</h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              <MTag sev={result.rule.severity}>{result.rule.severity}</MTag>
              <MTag muted>{result.rule.section.replace('Docker daemon configuration files', 'Files').replace('Container Runtime', 'Runtime')}</MTag>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors cursor-pointer mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <div className="rounded-sm border border-rose-500/15 bg-rose-500/[0.06] px-3 py-2.5">
            <p className="text-xs text-rose-400 font-mono uppercase tracking-wider mb-1">Finding</p>
            <p className="text-xs text-zinc-300">{result.message}</p>
            {result.affected.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {result.affected.map((a) => (
                  <code key={a} className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] text-[11px] font-mono text-zinc-400">{a}</code>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500 mb-3">Steps</p>
            <ol className="space-y-2.5">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="shrink-0 font-mono text-xs text-zinc-600 w-5 pt-0.5">{i + 1}.</span>
                  <span className="text-zinc-300 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500">Commands</p>
              <button onClick={handleCopy} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="bg-black/50 border border-white/[0.06] rounded-sm px-4 py-3.5 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre leading-relaxed">
              {commands}
            </pre>
          </div>

          {mode === 'manual' && result.audit_command && (
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-zinc-500 mb-2">Verify with</p>
              <pre className="bg-black/50 border border-white/[0.06] rounded-sm px-4 py-3 text-xs font-mono text-zinc-400 overflow-x-auto">
                {result.audit_command}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 pt-2">
            {[
              { label: 'CIS Benchmark', href: 'https://www.cisecurity.org/benchmark/docker' },
              { label: 'Docker Docs', href: 'https://docs.docker.com/engine/security/' },
            ].map(({ label, href }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                {label} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function getFixSteps(result: CheckResult): string[] {
  const { id, section } = result.rule
  if (section === 'Docker daemon configuration files' || id.startsWith('3.')) {
    return [
      'Connect to the Docker host via SSH.',
      'Run the fix command shown below (requires root / sudo).',
      'Verify the change took effect with the audit command.',
    ]
  }
  if (section === 'Daemon' || id.startsWith('2.')) {
    return [
      'Connect to the host running the Docker daemon via SSH.',
      'Open /etc/docker/daemon.json in your editor (create if it does not exist).',
      'Apply the configuration change shown in the commands block.',
      'Restart the Docker daemon to apply the new configuration.',
      'Run the audit command to verify the change took effect.',
    ]
  }
  const containers = result.affected.length > 0 ? result.affected.join(', ') : 'the affected container(s)'
  return [
    `Identify ${containers} that need to be updated.`,
    'Stop and remove the non-compliant container.',
    'Recreate it with the security flag shown in the commands block.',
    'Verify the container started successfully and the rule now passes.',
  ]
}

function getFixCommands(result: CheckResult): string {
  const { id } = result.rule
  switch (id) {
    case '2.10':
      return `# If daemon.json already exists, merge — do not overwrite entirely.
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "userns-remap": "default"
}
EOF
sudo systemctl restart docker
docker info --format '{{json .SecurityOptions}}'`
    case '2.11':
      return `sudo nano /etc/docker/daemon.json
# Remove the "cgroup-parent" key, save and exit.
sudo systemctl restart docker`
    case '3.1': case '3.5': case '3.17':
      return `sudo chown root:root ${getFilePathForRule(id)}
stat -c %U:%G ${getFilePathForRule(id)}`
    case '3.15':
      return `sudo chown root:docker /var/run/docker.sock
stat -c %U:%G /var/run/docker.sock`
    case '3.2': case '3.18':
      return `sudo chmod 644 ${getFilePathForRule(id)}
stat -c %a ${getFilePathForRule(id)}`
    case '3.6':
      return `sudo chmod 755 /etc/docker
stat -c %a /etc/docker`
    case '3.16':
      return `sudo chmod 660 /var/run/docker.sock
stat -c %a /var/run/docker.sock`
    case '5.10': return containerFixCmd(result.affected, '', '--network host', '--network bridge')
    case '5.11': return containerFixCmd(result.affected, '--memory 512m', '', '')
    case '5.12': return containerFixCmd(result.affected, '--cpu-shares 512', '', '')
    case '5.13': return containerFixCmd(result.affected, '--read-only', '', '')
    case '5.16': return containerFixCmd(result.affected, '', '--pid host', '')
    case '5.17': return containerFixCmd(result.affected, '', '--ipc host', '')
    case '5.21': return containerFixCmd(result.affected, '', '--uts host', '')
    case '5.22': return containerFixCmd(result.affected, '', '--security-opt seccomp=unconfined', '--security-opt seccomp=builtin')
    case '5.25': case '5.5': return containerFixCmd(result.affected, '', '--privileged', '')
    case '5.26': return containerFixCmd(result.affected, '--security-opt no-new-privileges', '', '')
    case '5.29': return containerFixCmd(result.affected, '--pids-limit 100', '', '')
    case '5.31': return containerFixCmd(result.affected, '', '--userns host', '')
    case '5.32': return containerFixCmd(result.affected, '', '-v /var/run/docker.sock:/...', '')
    case '5.2':  return containerFixCmd(result.affected, '--security-opt apparmor=docker-default', '', '')
    case '5.3':  return containerFixCmd(result.affected, '--security-opt label=level:s0', '', '')
    case '5.4':  return containerFixCmd(result.affected, '--cap-drop=ALL --cap-add=<needed>', '--cap-add=...', '')
    case '5.6':  return containerFixCmd(result.affected, '', '-v /etc:/etc (sensitive mount)', '-v /data:/data')
    case '5.8':  return containerFixCmd(result.affected, '-p 8080:80', '-p 80:80 (privileged port)', '')
    case '5.27': return containerFixCmd(result.affected, '--health-cmd "curl -f http://localhost/health || exit 1" --health-interval 30s', '', '')
    default:
      return `# Refer to CIS Docker Benchmark section ${id}.\nsudo nano /etc/docker/daemon.json\nsudo systemctl restart docker`
  }
}

function getFilePathForRule(id: string): string {
  if (id === '3.1' || id === '3.2') return '/lib/systemd/system/docker.service'
  if (id === '3.5' || id === '3.6') return '/etc/docker'
  if (id === '3.17' || id === '3.18') return '/etc/docker/daemon.json'
  return ''
}

function containerFixCmd(affected: string[], addFlag: string, removeNote: string, replaceWith: string): string {
  const name = affected[0] ?? '<container>'
  const flag = addFlag ? `  ${addFlag} \\\n` : ''
  const replaceNote = replaceWith ? `\n# Replace ${removeNote} with: ${replaceWith}` : removeNote ? `\n# Remove: ${removeNote}` : ''
  return `# Stop and recreate the container${replaceNote}
docker stop ${name}
docker rm ${name}

docker run -d \\
  --name ${name} \\
${flag}  <image>

# Affected: ${affected.length > 1 ? affected.join(', ') : name}`
}

// ── Micro components ──────────────────────────────────────────────────────────

function StatCell({ icon, label, value, total, accent, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; total: number; accent: string; active?: boolean; onClick?: () => void
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <button className={`px-5 py-3.5 text-left w-full transition-colors cursor-pointer ${active ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`} onClick={onClick}>
      <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums ${accent}`}>{value}</span>
        <span className="text-xs text-zinc-600">/ {total}</span>
        <span className="ml-auto text-xs font-mono text-zinc-600">{pct}%</span>
      </div>
    </button>
  )
}

function MTag({ children, muted, sev }: { children: React.ReactNode; muted?: boolean; sev?: string }) {
  const sevColor = sev === 'High' ? 'border-rose-500/20 text-rose-400'
    : sev === 'Medium' ? 'border-amber-500/20 text-amber-400'
    : sev === 'Low' ? 'border-zinc-500/20 text-zinc-400'
    : ''
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border ${
      muted ? 'border-white/[0.07] text-zinc-600' : sevColor || 'border-white/[0.1] text-zinc-400'
    }`}>
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

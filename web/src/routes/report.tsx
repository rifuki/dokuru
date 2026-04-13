import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Download, FileText, Search, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAudit } from '@/features/audit/hooks/use-audit'
import { useTrivyImageScan } from '@/features/trivy/hooks/use-trivy-image-scan'
import { HttpError } from '@/lib/api/client'

export const Route = createFileRoute('/report')({
  component: ReportPage,
})

function ReportPage() {
  const { data: report } = useAudit()
  const [imageRef, setImageRef] = useState('nginx:latest')
  const { mutateAsync: runTrivyScan, data: trivyReport, isPending, error } = useTrivyImageScan()

  const failing = useMemo(
    () => report?.results.filter((result) => result.status === 'Fail') ?? [],
    [report],
  )

  const handleDownload = () => {
    if (!report) return

    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`
    const anchor = document.createElement('a')
    anchor.setAttribute('href', dataStr)
    anchor.setAttribute('download', 'dokuru_audit_report.json')
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    toast.success('Executive report exported', {
      description: 'The current audit snapshot has been saved as JSON.',
    })
  }

  const handleTrivyScan = async () => {
    await runTrivyScan(imageRef)
  }

  const trivyError = error instanceof HttpError ? error.message : error?.message

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
              <FileText className="h-3.5 w-3.5" />
              Executive Report
            </div>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-5xl">Operational narrative, not raw JSON.</h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              Summarize host posture, isolate the failing controls worth prioritizing, and layer optional image vulnerability scanning without losing the hardening-first focus.
            </p>
          </div>

          <Button onClick={handleDownload} disabled={!report} className="rounded-full bg-[linear-gradient(135deg,#38BDF8,#6366F1)] px-5 py-6 text-sm font-semibold text-slate-950 hover:opacity-95">
            <Download className="mr-2 h-4 w-4" />
            Export JSON snapshot
          </Button>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-4">
          <ReportMetric label="Score" value={report ? `${report.score}` : '--'} detail="CIS benchmark health" />
          <ReportMetric label="Failures" value={String(failing.length)} detail="Controls needing operator action" tone="danger" />
          <ReportMetric label="Hostname" value={report?.hostname ?? '--'} detail="Active Docker host" />
          <ReportMetric label="Docker" value={report?.docker_version ? `v${report.docker_version}` : '--'} detail="Engine version" />
        </div>
      </motion.section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <motion.div className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div>
            <p className="text-lg font-semibold text-white">Executive summary</p>
            <p className="mt-2 text-sm leading-7 text-slate-400">The controls that matter most to the operator right now.</p>
          </div>

          {!report ? (
            <div className="mt-8 rounded-[24px] border border-white/8 bg-white/4 px-5 py-6 text-sm text-slate-400">
              No audit snapshot available yet. Run a live audit to generate the first report state.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {failing.length === 0 ? (
                <div className="rounded-[24px] border border-emerald-400/16 bg-emerald-400/8 px-5 py-6 text-sm text-emerald-50/90">
                  No failing controls were found in the latest report snapshot.
                </div>
              ) : (
                failing.map((result) => (
                  <div key={result.rule.id} className="rounded-[26px] border border-rose-400/12 bg-rose-400/6 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">Rule {result.rule.id}</span>
                      <Badge variant="destructive" className="border-rose-400/20 bg-rose-400/12 text-rose-100">{result.status}</Badge>
                      <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-100">{result.rule.severity}</Badge>
                      <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-100">{result.rule.section}</Badge>
                    </div>
                    <p className="mt-3 text-base font-medium text-slate-100">{result.rule.title}</p>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{result.message}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">Remediation mode: {result.remediation_kind}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>

        <motion.div className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div>
            <p className="text-lg font-semibold text-white">Coverage profile</p>
            <p className="mt-2 text-sm leading-7 text-slate-400">A compact view of how the latest audit was distributed across hardening surfaces.</p>
          </div>

          <div className="mt-6 grid gap-3">
            <CoverageRow label="Daemon controls" value={report ? report.results.filter((result) => result.rule.section === 'Daemon').length : 0} total={report?.results.length ?? 0} />
            <CoverageRow label="Runtime controls" value={report ? report.results.filter((result) => result.rule.section !== 'Daemon').length : 0} total={report?.results.length ?? 0} />
            <CoverageRow label="Auto remediation paths" value={report ? report.results.filter((result) => result.remediation_kind === 'auto').length : 0} total={report?.results.length ?? 0} />
            <CoverageRow label="Guided remediation paths" value={report ? report.results.filter((result) => result.remediation_kind === 'guided').length : 0} total={report?.results.length ?? 0} />
          </div>

          <div className="mt-6 rounded-[24px] border border-white/8 bg-white/4 p-5 text-sm leading-7 text-slate-300">
            <p className="font-medium text-white">Operator note</p>
            <p className="mt-2">
              Dokuru is intentionally strongest at Docker hardening and remediation workflow. CVE and image-package visibility remain complementary integrations rather than the product core.
            </p>
          </div>
        </motion.div>
      </section>

      <motion.section className="glass-card panel-outline rounded-[28px] p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <div className="flex items-start gap-3">
          <span className="rounded-2xl border border-sky-400/18 bg-sky-400/10 p-2.5 text-sky-200">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-semibold text-white">Trivy image scan</p>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Optional vulnerability scanning integrated through Trivy. This complements Dokuru hardening checks instead of replacing them.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          <input
            value={imageRef}
            onChange={(event) => setImageRef(event.target.value)}
            placeholder="nginx:latest"
            className="h-12 flex-1 rounded-full border border-white/10 bg-white/5 px-5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/30"
          />
          <Button
            onClick={handleTrivyScan}
            disabled={isPending || imageRef.trim().length === 0}
            className="rounded-full bg-[linear-gradient(135deg,#38BDF8,#6366F1)] px-5 py-6 text-sm font-semibold text-slate-950 hover:opacity-95"
          >
            <Search className="mr-2 h-4 w-4" />
            {isPending ? 'Scanning image...' : 'Scan image'}
          </Button>
        </div>

        {trivyError ? (
          <div className="mt-5 rounded-[24px] border border-rose-400/16 bg-rose-400/10 px-5 py-4 text-sm text-rose-100">
            {trivyError}
          </div>
        ) : null}

        {trivyReport ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-5">
              <SeverityCard label="Critical" value={trivyReport.summary.critical} tone="critical" />
              <SeverityCard label="High" value={trivyReport.summary.high} tone="high" />
              <SeverityCard label="Medium" value={trivyReport.summary.medium} tone="medium" />
              <SeverityCard label="Low" value={trivyReport.summary.low} tone="low" />
              <SeverityCard label="Total" value={trivyReport.summary.total} tone="neutral" />
            </div>

            <div className="rounded-[26px] border border-white/8 bg-white/4">
              <div className="border-b border-white/8 px-5 py-4">
                <p className="text-sm font-medium text-white">Top findings for {trivyReport.image}</p>
                <p className="mt-1 text-xs text-slate-400">Showing up to 10 vulnerabilities sorted by severity.</p>
              </div>
              <div className="divide-y divide-white/6">
                {trivyReport.findings.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-slate-400">No vulnerabilities were reported by Trivy for this image.</div>
                ) : (
                  trivyReport.findings.slice(0, 10).map((finding) => (
                    <div key={`${finding.target}-${finding.vulnerability_id}-${finding.package_name}`} className="px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{finding.vulnerability_id} • {finding.package_name}</p>
                          <p className="mt-1 text-xs text-slate-500">Installed: {finding.installed_version}{finding.fixed_version ? ` • Fixed: ${finding.fixed_version}` : ' • No fixed version reported'}</p>
                          {finding.title ? <p className="mt-3 text-sm leading-7 text-slate-300">{finding.title}</p> : null}
                        </div>
                        <span className={severityBadgeClass(finding.severity)}>{finding.severity}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </motion.section>
    </div>
  )
}

function ReportMetric({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'danger'
}) {
  const toneClass = tone === 'danger' ? 'text-rose-300' : 'text-white'

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  )
}

function CoverageRow({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total > 0 ? Math.max((value / total) * 100, 6) : 0

  return (
    <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm font-medium text-white">{value}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#38BDF8,#6366F1)]" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function SeverityCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'critical' | 'high' | 'medium' | 'low' | 'neutral'
}) {
  const toneClass = {
    critical: 'border-rose-400/18 bg-rose-400/10 text-rose-100',
    high: 'border-orange-400/18 bg-orange-400/10 text-orange-100',
    medium: 'border-amber-400/18 bg-amber-400/10 text-amber-100',
    low: 'border-sky-400/18 bg-sky-400/10 text-sky-100',
    neutral: 'border-white/10 bg-white/5 text-white',
  }[tone]

  return (
    <div className={`rounded-[24px] border px-4 py-4 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-[0.24em] opacity-80">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function severityBadgeClass(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return 'status-chip border-rose-400/20 bg-rose-400/12 text-rose-100'
    case 'HIGH':
      return 'status-chip border-orange-400/20 bg-orange-400/12 text-orange-100'
    case 'MEDIUM':
      return 'status-chip border-amber-400/20 bg-amber-400/12 text-amber-100'
    case 'LOW':
      return 'status-chip border-sky-400/20 bg-sky-400/12 text-sky-100'
    default:
      return 'status-chip border-white/10 bg-white/8 text-slate-200'
  }
}

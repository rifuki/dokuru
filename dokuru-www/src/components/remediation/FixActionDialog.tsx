import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ShieldCheck, Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { CheckResult } from '@/types/dokuru'

interface FixActionDialogProps {
  open: boolean
  result: CheckResult | null
  isApplying: boolean
  onClose: () => void
  onConfirm: () => void
}

export function FixActionDialog({
  open,
  result,
  isApplying,
  onClose,
  onConfirm,
}: FixActionDialogProps) {
  return (
    <AnimatePresence>
      {open && result ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(5,10,20,0.92))] p-6 shadow-[0_32px_120px_rgba(2,6,23,0.7)]"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.2),transparent_36%)]" />
            <div className="relative space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-sky-200">
                    <Wrench className="h-3.5 w-3.5" />
                    Remediation Preview
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-300">Rule {result.rule.id}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{result.rule.title}</h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.3fr_0.9fr]">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-100">
                      {result.remediation_kind}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-100">
                      {result.rule.section}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 bg-white/8 text-slate-100">
                      {result.rule.severity}
                    </Badge>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-slate-300">{result.rule.description}</p>
                  <div className="mt-5 rounded-2xl border border-sky-400/16 bg-sky-400/8 p-4 text-sm text-sky-100">
                    <p className="font-medium text-white">Recommended remediation</p>
                    <p className="mt-2 leading-7">{result.rule.remediation}</p>
                  </div>
                </div>

                <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
                    <div>
                      <p className="text-sm font-medium text-white">What Dokuru will do</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {result.remediation_kind === 'auto'
                          ? 'Apply a daemon-level hardening change directly on the host if the running agent has the necessary privileges.'
                          : 'Return guided remediation instructions so you can adjust runtime flags, Compose files, or deployment manifests safely.'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-400/16 bg-amber-400/8 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
                      <div>
                        <p className="text-sm font-medium text-amber-100">Operational note</p>
                        <p className="mt-2 text-sm leading-7 text-amber-50/80">
                          Auto-fix for daemon rules still requires the Dokuru service to run with permission to edit `/etc/docker/daemon.json`. Guided fixes never rewrite running container flags in-place.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" className="border-white/12 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={onClose}>
                  Cancel
                </Button>
                <Button className="bg-[linear-gradient(135deg,#38BDF8,#6366F1)] text-slate-950 hover:opacity-95" onClick={onConfirm} disabled={isApplying}>
                  {isApplying ? 'Applying...' : result.remediation_kind === 'auto' ? 'Apply Remediation' : 'Get Guidance'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

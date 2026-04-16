import { createFileRoute, useNavigate, Link, redirect } from '@tanstack/react-router'
import { Activity, Shield, Server, Box, Layers, Network, HardDrive, AlertTriangle, CheckCircle2, Play, Clock, TrendingUp } from 'lucide-react'

import { useAudit } from '@/features/audit/hooks/use-audit'
import { useHealth } from '@/features/health/hooks/use-health'
import { useEnvInfo } from '@/features/environments/hooks/use-env-info'
import { useEnvironmentStore } from '@/stores/environment-store'
import { useAuthStore } from '@/stores/use-auth-store'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: () => {
    const isAuthenticated = useAuthStore.getState().isAuthenticated;
    if (!isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const navigate = useNavigate()
  const { data: health } = useHealth()
  const { data: report, refetch, isFetching } = useAudit(false)
  const { data: info } = useEnvInfo()

  const environments = useEnvironmentStore((s) => s.environments)
  const activeId = useEnvironmentStore((s) => s.activeEnvironmentId)
  const activeEnv = environments.find((e) => e.id === activeId)

  if (!activeId) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-400">
        <Server className="w-14 h-14 opacity-20" />
        <p className="text-base">No environment connected.</p>
        <button
          onClick={() => navigate({ to: '/' })}
          className="text-[#3BA5EF] text-sm hover:underline cursor-pointer"
        >
          Go to Environments →
        </button>
      </div>
    )
  }

  const failedRules = report?.results.filter((result) => result.status === 'Fail') ?? []
  const passedRules = report?.passed ?? 0
  const totalRules = report?.results.length ?? 0
  const daemonRules = report?.results.filter((result) => result.rule.section === 'Daemon') ?? []
  const daemonFailed = daemonRules.some((r) => r.status === 'Fail')
  const runtimeRules = report?.results.filter((result) => result.rule.section !== 'Daemon') ?? []
  const runtimeFailed = runtimeRules.some((r) => r.status === 'Fail')

  const score = report?.score ?? 0
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400'

  return (
    <div className="space-y-6 pb-8 max-w-7xl mx-auto">
      {/* Environment Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="rounded border border-[#3BA5EF]/20 bg-[#3BA5EF]/10 p-2 text-[#3BA5EF]">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard <span className="text-slate-500 font-normal text-base ml-2">{activeEnv?.name ?? 'local'}</span></h1>
            <p className="text-xs text-slate-400 mt-0.5">{health?.docker_version ? `Docker Standalone ${health.docker_version}` : 'Connecting...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${health?.docker_connected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/20 bg-rose-500/10 text-rose-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${health?.docker_connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            {health?.docker_connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Security Score Card */}
          <section className="bg-[#23282D] rounded-md border border-white/5 p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  Security Posture
                </h3>
                
                <div className="mt-4 flex items-end gap-3">
                  <span className={`text-6xl font-bold ${scoreColor} tracking-tight`}>{score}</span>
                  <span className="text-slate-400 mb-2 text-lg">/ 100</span>
                  <div className="ml-4 mb-2 flex items-center gap-1.5 text-sm text-emerald-400">
                    <TrendingUp className="h-4 w-4" />
                    <span>+5</span>
                  </div>
                </div>

                <Progress value={score} className="h-2.5 mt-5 bg-white/10 [&_[data-slot=progress-indicator]]:bg-sky-400" />

                <div className="flex items-center gap-6 mt-5 text-sm">
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="font-semibold text-white">{passedRules}</span> passed
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <span className="font-semibold text-white">{failedRules.length}</span> failures
                  </div>
                  <div className="ml-auto text-xs text-slate-500">
                    {totalRules} rules evaluated
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Resource Overview */}
          <div>
            <h2 className="text-sm font-medium text-slate-200 mb-3">Resources</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
              <StatsBox icon={Layers} label="Stacks" value={info?.stacks != null ? info.stacks.toString() : '0'} color="text-indigo-400" bgColor="bg-indigo-400/10" />
              <StatsBox icon={Box} label="Containers" value={info?.containers?.total != null ? info.containers.total.toString() : (report?.total_containers?.toString() ?? '0')} color="text-sky-400" bgColor="bg-sky-400/10" />
              <StatsBox icon={HardDrive} label="Images" value={info?.images != null ? info.images.toString() : '0'} color="text-amber-400" bgColor="bg-amber-400/10" />
              <StatsBox icon={Activity} label="Volumes" value={info?.volumes != null ? info.volumes.toString() : '0'} color="text-emerald-400" bgColor="bg-emerald-400/10" />
              <StatsBox icon={Network} label="Networks" value={info?.networks != null ? info.networks.toString() : '0'} color="text-purple-400" bgColor="bg-purple-400/10" />
            </div>
          </div>

          {/* Compliance Breakdown */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-[#23282D] rounded-md border border-white/5 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-4">Daemon Hardening</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-white">{daemonRules.length}</p>
                  <p className="text-xs text-slate-500 mt-1">Host-level rules</p>
                </div>
                <div className={`h-12 w-12 rounded-full border-4 flex items-center justify-center ${daemonFailed ? 'border-rose-500/20 bg-rose-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}`}>
                  <span className={`text-xs font-bold ${daemonFailed ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {daemonFailed ? 'FAIL' : 'OK'}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-[#23282D] rounded-md border border-white/5 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-4">Runtime Isolation</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-white">{runtimeRules.length}</p>
                  <p className="text-xs text-slate-500 mt-1">Container rules</p>
                </div>
                <div className={`h-12 w-12 rounded-full border-4 flex items-center justify-center ${runtimeFailed ? 'border-rose-500/20 bg-rose-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}`}>
                  <span className={`text-xs font-bold ${runtimeFailed ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {runtimeFailed ? 'FAIL' : 'OK'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <section className="bg-[#23282D] rounded-md border border-white/5 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Button
                onClick={() => refetch()}
                disabled={isFetching}
                className="w-full justify-start gap-2 bg-sky-500/10 border border-sky-500/20 text-sky-200 hover:bg-sky-500/20"
              >
                {isFetching ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-sky-400/40 border-t-transparent animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Audit
                  </>
                )}
              </Button>
              <Link
                to="/audit"
                className="flex w-full items-center justify-start gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <Shield className="h-4 w-4" />
                Live Audit
              </Link>
            </div>
          </section>

          {/* System Info */}
          <section className="bg-[#23282D] rounded-md border border-white/5 p-4">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-sky-400" />
              System Info
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Hostname</p>
                <p className="text-sm font-medium text-white truncate mt-0.5">{report?.hostname ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">OS / Arch</p>
                <p className="text-sm font-medium text-white truncate mt-0.5">
                  {info ? `${info.os ?? '--'} / ${info.architecture ?? '--'}` : '--'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Engine API</p>
                <p className="text-sm font-medium text-white mt-0.5">{health?.docker_version ? `v${health.docker_version}` : '--'}</p>
              </div>
            </div>
          </section>

          {/* Recent Activity */}
          <section className="bg-[#23282D] rounded-md border border-white/5 p-4">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-purple-400" />
              Recent Activity
            </h3>
            <div className="space-y-3">
              <ActivityItem
                icon={<Shield className="h-3.5 w-3.5" />}
                text="Security audit completed"
                time="2 min ago"
                color="emerald"
              />
              <ActivityItem
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                text="1 new security issue detected"
                time="5 min ago"
                color="rose"
              />
              <ActivityItem
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                text="Daemon configuration updated"
                time="1 hour ago"
                color="sky"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function StatsBox({ icon: Icon, label, value, color, bgColor }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-[#23282D] rounded-md border border-white/5 p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.04] transition-colors relative overflow-hidden group">
      <div className={`absolute -right-2 -top-2 w-12 h-12 rounded-full ${bgColor} blur-xl group-hover:bg-opacity-80 transition-all`} />
      <Icon className={`h-5 w-5 ${color} mb-2 relative z-10`} />
      <span className="text-xl font-bold text-white leading-none relative z-10">{value}</span>
      <span className="text-[11px] text-slate-400 mt-1 relative z-10 uppercase font-medium">{label}</span>
    </div>
  )
}

function ActivityItem({ icon, text, time, color }: { icon: React.ReactNode; text: string; time: string; color: 'emerald' | 'rose' | 'sky' }) {
  const colorClasses = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    rose: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
    sky: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className={`rounded border p-1.5 ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{text}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{time}</p>
      </div>
    </div>
  )
}

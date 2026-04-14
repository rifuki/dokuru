import { createFileRoute } from '@tanstack/react-router'
import { Activity, Shield, Server, Box, Layers, Network, HardDrive, AlertTriangle, CheckCircle2 } from 'lucide-react'

import { useAudit } from '@/features/audit/hooks/use-audit'
import { useHealth } from '@/features/health/hooks/use-health'
import { Progress } from '@/components/ui/progress'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: health } = useHealth()
  const { data: report } = useAudit(true)

  const failedRules = report?.results.filter((result) => result.status === 'Fail') ?? []
  const passedRules = report?.passed ?? 0
  const totalRules = report?.results.length ?? 0
  const daemonRules = report?.results.filter((result) => result.rule.section === 'Daemon') ?? []
  const runtimeRules = report?.results.filter((result) => result.rule.section !== 'Daemon') ?? []

  return (
    <div className="space-y-6 pb-8 max-w-6xl mx-auto">
      {/* Environment Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="rounded border border-[#3BA5EF]/20 bg-[#3BA5EF]/10 p-2 text-[#3BA5EF]">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard <span className="text-slate-500 font-normal text-base ml-2">local</span></h1>
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

      <div className="grid gap-4 md:grid-cols-2">
        {/* Hardware / Engine Telemetry */}
        <section className="bg-[#23282D] rounded-md border border-white/5 p-4 flex flex-col justify-between">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-sky-400" />
                Endpoint Telemetry
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <p className="text-xs text-slate-500">Hostname</p>
                  <p className="text-sm font-medium text-white truncate mt-0.5">{report?.hostname ?? 'N/A'}</p>
               </div>
               <div>
                  <p className="text-xs text-slate-500">OS / Architecture</p>
                  <p className="text-sm font-medium text-white truncate mt-0.5">linux / amd64</p>
               </div>
               <div>
                  <p className="text-xs text-slate-500">Total Containers</p>
                  <p className="text-sm font-medium text-white mt-0.5">{report?.total_containers ?? '--'}</p>
               </div>
               <div>
                  <p className="text-xs text-slate-500">Engine API</p>
                  <p className="text-sm font-medium text-white mt-0.5">{health?.docker_version ? `v${health.docker_version}` : '--'}</p>
               </div>
            </div>
        </section>

        {/* Audit Score Summary */}
        <section className="bg-[#23282D] rounded-md border border-white/5 p-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    CIS Security Posture
                </h3>
            </div>
            
            <div className="flex items-end gap-3 mt-3">
                <span className="text-5xl font-bold text-white tracking-tight">{report?.score ?? '--'}</span>
                <span className="text-slate-400 mb-1">/ 100</span>
            </div>

            <Progress value={report?.score ?? 0} className="h-2 mt-4 bg-white/10 [&_[data-slot=progress-indicator]]:bg-sky-400" />

            <div className="flex items-center gap-4 mt-5 text-sm">
                <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-white">{passedRules}</span> passed
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <span className="font-medium text-white">{failedRules.length}</span> failures
                </div>
                <div className="ml-auto text-xs text-slate-500">
                    {totalRules} rules evaluated
                </div>
            </div>
        </section>
      </div>

      {/* Portainer Style Resource Overview */}
      <h2 className="text-sm font-medium text-slate-200 mt-6 mb-3">Resource Overview</h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
         <StatsBox icon={Layers} label="Stacks" value="5" color="text-indigo-400" bgColor="bg-indigo-400/10" borderColor="border-indigo-400/20" />
         <StatsBox icon={Box} label="Containers" value={report?.total_containers?.toString() ?? '0'} color="text-sky-400" bgColor="bg-sky-400/10" borderColor="border-sky-400/20" />
         <StatsBox icon={HardDrive} label="Images" value="35" color="text-amber-400" bgColor="bg-amber-400/10" borderColor="border-amber-400/20" />
         <StatsBox icon={Activity} label="Volumes" value="1" color="text-emerald-400" bgColor="bg-emerald-400/10" borderColor="border-emerald-400/20" />
         <StatsBox icon={Network} label="Networks" value="3" color="text-purple-400" bgColor="bg-purple-400/10" borderColor="border-purple-400/20" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-2">
        <div className="bg-[#23282D] rounded-md border border-white/5 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Daemon Hardening</h3>
            <div className="flex items-center justify-between">
                <div>
                   <p className="text-2xl font-bold text-white">{daemonRules.length}</p>
                   <p className="text-xs text-slate-500 mt-1">Host-level configuration rules</p>
                </div>
                <div className="h-10 w-10 rounded-full border-4 border-emerald-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-emerald-500">OK</span>
                </div>
            </div>
        </div>
        <div className="bg-[#23282D] rounded-md border border-white/5 p-4 flex flex-col justify-between">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Container Runtime Isolation</h3>
            <div className="flex items-center justify-between">
                <div>
                   <p className="text-2xl font-bold text-white">{runtimeRules.length}</p>
                   <p className="text-xs text-slate-500 mt-1">Workload isolation and capability rules</p>
                </div>
                <div className="h-10 w-10 rounded-full border-4 border-rose-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-rose-500">FAIL</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}

function StatsBox({ icon: Icon, label, value, color, bgColor, borderColor }: any) {
    return (
        <div className="bg-[#23282D] rounded-md border border-white/5 p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.04] transition-colors relative overflow-hidden group">
           <div className={`absolute -right-2 -top-2 w-12 h-12 rounded-full ${bgColor} blur-xl group-hover:bg-opacity-80 transition-all`} />
           <Icon className={`h-5 w-5 ${color} mb-2 relative z-10`} />
           <span className="text-xl font-bold text-white leading-none relative z-10">{value}</span>
           <span className="text-[11px] text-slate-400 mt-1 relative z-10 uppercase font-medium">{label}</span>
        </div>
    )
}

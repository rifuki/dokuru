import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Activity, Server, Settings, Terminal, Shield, RefreshCw, HardDrive, Cpu, Edit, Trash2, CheckCircle2, ChevronDown, ListFilter, Play, Settings2, Layers, Box } from 'lucide-react'
import { useHealth } from '@/features/health/hooks/use-health'
import { Button } from '@/components/ui/button'
import { useAudit } from '@/features/audit/hooks/use-audit'

export const Route = createFileRoute('/')({
  component: EnvironmentsPage,
})

function EnvironmentsPage() {
  const { data: health, isLoading } = useHealth()
  const { data: report } = useAudit()
  const navigate = useNavigate()

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
             <div className="bg-[#252830] p-1.5 rounded-md border border-white/5 text-slate-300">
                <HardDrive className="w-5 h-5" />
             </div>
             Environments
          </h1>
          <p className="text-sm text-slate-400 mt-1">Select an environment to manage.</p>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="outline" className="h-9 px-4 rounded border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white cursor-pointer">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
           </Button>
           <Button className="h-9 px-4 rounded bg-[#3BA5EF] text-white hover:bg-[#3BA5EF]/90 border-none cursor-pointer font-medium text-[13px]">
              Add environment
           </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-[#252830]/30 p-2 rounded-md border border-white/5 flex items-center justify-between gap-4">
         <div className="flex items-center gap-2">
            <FilterDropdown label="Connection" />
            <FilterDropdown label="Status" />
            <FilterDropdown label="Agent Version" />
            <button className="text-[13px] font-medium text-white hover:underline ml-2 cursor-pointer">Clear all</button>
         </div>

         <div className="flex items-center gap-3 flex-1 max-w-2xl">
             <div className="relative flex-1">
                 <SearchIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                 <input type="text" placeholder="Search by name, status, URL..." className="h-9 w-full bg-[#1E2125] border border-white/10 rounded pl-9 pr-3 text-[13px] text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3BA5EF]/50 focus:ring-1 focus:ring-[#3BA5EF]/50 transition-all font-mono" />
             </div>
             
             <div className="flex items-center gap-2 text-[13px] text-slate-300">
                 <span className="whitespace-nowrap">Sort By</span>
                 <FilterDropdown label="Name" className="min-w-[100px]" />
                 <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-white shrink-0 border border-transparent hover:border-white/10 hover:bg-white/5 cursor-pointer">
                    <ArrowDownUp className="w-4 h-4" />
                 </Button>
             </div>
         </div>
      </div>

      {/* Environment List */}
      <div className="bg-[#23282D] rounded-md border border-white/5 flex">
          <div 
             className="flex-1 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors flex items-center gap-6"
             onClick={() => navigate({ to: '/dashboard' })}
          >
              <div className="w-14 items-center flex justify-center text-[#3BA5EF]">
                  <DockerIcon className="w-14 h-14" />
              </div>

              <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-white tracking-tight">local</span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${health?.docker_connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/30 bg-rose-500/10 text-rose-400'} text-[11px] font-semibold uppercase`}>
                        <CheckCircle2 className="w-3 h-3" />
                        {health?.docker_connected ? 'UP' : 'DOWN'}
                      </span>
                      <span className="text-[12px] text-slate-400 flex items-center gap-1.5 font-mono">
                          <Activity className="w-3.5 h-3.5" />
                          {new Date().toLocaleString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: false}).replace(',','')}
                      </span>
                      <span className="text-[12px] text-slate-300 font-mono font-medium ml-2">Standalone {health?.docker_version ?? 'Loading...'}</span>
                      <span className="text-[12px] text-slate-400 font-mono">/var/run/docker.sock</span>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-[12px] text-slate-400">
                      <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-300">Group:</span> Unassigned
                      </div>
                      <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5" /> No tags
                      </div>
                      <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" /> Local
                      </div>
                  </div>

                  {/* Resource metrics similar to Portainer */}
                  <div className="flex items-center gap-6 mt-4 text-[13px] font-medium text-slate-200">
                      <div className="flex items-center gap-2">
                         <Layers className="w-4 h-4 text-slate-400" />
                         <span>5 stacks</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <Box className="w-4 h-4 text-slate-400" />
                         <span className="flex items-center gap-1.5 text-slate-300">
                            {report?.total_containers ?? 0} containers 
                            <span className="text-emerald-400 flex items-center ml-1">{report?.total_containers ?? 0} <Play size={10} className="ml-0.5 fill-current"/></span>
                            <span className="text-rose-400 flex items-center">0 <Square size={10} className="ml-0.5 fill-current"/></span>
                         </span>
                      </div>
                      <div className="flex items-center gap-2">
                         <HardDrive className="w-4 h-4 text-slate-400" />
                         <span>1 volume</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <ListFilter className="w-4 h-4 text-slate-400" />
                         <span>35 images</span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                         <Cpu className="w-4 h-4 text-slate-400" />
                         <span>2 CPU</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <Server className="w-4 h-4 text-slate-400" />
                         <span>2 GB RAM</span>
                      </div>
                  </div>
              </div>
          </div>
          
          <div className="w-[200px] border-l border-white/5 flex flex-col justify-center gap-2 px-4 py-2 bg-black/10">
              <button className="flex items-center justify-center gap-2 h-8 w-full bg-[#383C41] hover:bg-[#43484D] text-slate-300 text-sm rounded font-medium transition-colors border border-white/5">
                 <Settings2 className="w-4 h-4" /> Disconnect
              </button>
              <button 
                 className="flex items-center justify-center gap-2 h-8 w-full bg-[#203D33] text-emerald-400 text-sm rounded font-medium transition-colors border border-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] cursor-pointer hover:bg-[#254A3E]"
                 onClick={() => navigate({ to: '/dashboard' })}
              >
                 <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Connected
              </button>
          </div>
          
          <div className="w-12 border-l border-white/5 flex flex-col items-center justify-start py-4 bg-black/10">
              <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded hover:bg-white/5 transition-colors group cursor-pointer" title="Edit environment">
                 <Edit className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
              <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded hover:bg-white/5 transition-colors group cursor-pointer" title="Delete environment">
                 <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
          </div>
      </div>
      
      {/* Footer controls */}
      <div className="flex items-center justify-end gap-3 text-sm text-slate-300">
         <span>Items per page</span>
         <div className="relative">
            <FilterDropdown label="10" className="min-w-[70px]" />
         </div>
      </div>

    </div>
  )
}

function DockerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 268" fill="currentColor" className={className}>
       <path d="M334,110.1c-8.3-5.6-30.2-8-46.1-3.7-.9-15.8-9-29.2-24-40.8l-5.5-3.7-3.7,5.6c-7.2,11-10.3,25.7-9.2,39,.8,8.2,3.7,17.4,9.2,24.1-20.7,12-39.8,9.3-124.3,9.3H0c-.4,19.1,2.7,55.8,26,85.6,2.6,3.3,5.4,6.5,8.5,9.6,19,19,47.6,32.9,90.5,33,65.4,0,121.4-35.3,155.5-120.8,11.2.2,40.8,2,55.3-26,.4-.5,3.7-7.4,3.7-7.4l-5.5-3.7h0ZM85.2,92.7h-36.7v36.7h36.7v-36.7ZM132.6,92.7h-36.7v36.7h36.7v-36.7ZM179.9,92.7h-36.7v36.7h36.7v-36.7ZM227.3,92.7h-36.7v36.7h36.7v-36.7ZM37.8,92.7H1.1v36.7h36.7v-36.7ZM85.2,46.3h-36.7v36.7h36.7v-36.7ZM132.6,46.3h-36.7v36.7h36.7v-36.7ZM179.9,46.3h-36.7v36.7h36.7v-36.7ZM179.9,0h-36.7v36.7h36.7V0Z" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  )
}

function ArrowDownUp({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>
  )
}

function Tag({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.707 8.707a2 2 0 0 0 2.828 0l7.172-7.172a2 2 0 0 0 0-2.828z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>
  )
}

function Zap({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  )
}

function Square({ className, size }: { className?: string, size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
  )
}

function FilterDropdown({ label, className = '' }: { label: string, className?: string }) {
  return (
    <button className={`flex items-center justify-between bg-[#252830] border border-white/10 text-slate-300 text-[13px] font-medium rounded h-9 px-3 hover:bg-[#2A2E35] hover:border-white/20 transition-all focus:outline-none focus:ring-1 focus:ring-[#3BA5EF]/50 ${className}`}>
      <span>{label}</span>
      <ChevronDown className="w-3.5 h-3.5 ml-2 text-slate-400" />
    </button>
  )
}

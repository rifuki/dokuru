import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Server, RefreshCw, Edit, Trash2, CheckCircle2, HardDrive, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEnvironmentStore } from '@/stores/environment-store'
import { AddEnvironmentModal } from '@/components/environments/AddEnvironmentModal'

export const Route = createFileRoute('/')({
  component: EnvironmentsPage,
})

function EnvironmentsPage() {
  const navigate = useNavigate()
  
  const environments = useEnvironmentStore((s) => s.environments)
  const fetchEnvironments = useEnvironmentStore((s) => s.fetchEnvironments)
  const activeEnvId = useEnvironmentStore((s) => s.activeEnvironmentId)
  const setActiveEnv = useEnvironmentStore((s) => s.setActiveEnvironment)
  const removeEnv = useEnvironmentStore((s) => s.removeEnvironment)
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  useEffect(() => {
    fetchEnvironments()
  }, [])

  return (
    <div className="space-y-6 pb-8">
      <AddEnvironmentModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
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
           <Button variant="outline" className="h-9 px-4 rounded border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white cursor-pointer" onClick={() => fetchEnvironments()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
           </Button>
           <Button onClick={() => setIsAddModalOpen(true)} className="h-9 px-4 rounded bg-[#3BA5EF] text-white hover:bg-[#3BA5EF]/90 border-none cursor-pointer font-medium text-[13px]">
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
      <div className="space-y-3">
        {environments.map((env) => {
          const isActive = activeEnvId === env.id;
          
          return (
            <div key={env.id} className={`bg-[#23282D] rounded-md border ${isActive ? 'border-[#3BA5EF]/50' : 'border-white/5'} flex transition-all`}>
                <div 
                  className="flex-1 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors flex items-center gap-6"
                  onClick={() => {
                    setActiveEnv(env.id);
                    navigate({ to: '/dashboard' });
                  }}
                >
                    <div className="w-14 items-center flex justify-center text-[#3BA5EF]">
                        <DockerIcon className="w-14 h-14" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-white tracking-tight">{env.name}</span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold uppercase">
                              <CheckCircle2 className="w-3 h-3" />
                              UP
                            </span>
                            <span className="text-[12px] text-slate-300 font-mono font-medium ml-2">{env.type.replace('_', ' ')}</span>
                            <span className="text-[12px] text-slate-400 font-mono">{env.url}</span>
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-[12px] text-slate-400">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-300">Added:</span> {new Date(env.added_at).toLocaleString()}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5" /> No tags
                            </div>
                        </div>

                        {/* We hide the deep resource metrics until user clicks inside, to simplify the main list for multi-tenancy */}
                    </div>
                </div>
                
                <div className="w-[200px] border-l border-white/5 flex flex-col justify-center gap-2 px-4 py-2 bg-black/10">
                    <button 
                       className={`flex items-center justify-center gap-2 h-8 w-full bg-[#203D33] text-emerald-400 text-sm rounded font-medium transition-colors border border-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] cursor-pointer hover:bg-[#254A3E] ${isActive ? 'ring-1 ring-emerald-500/50' : ''}`}
                       onClick={() => {
                         setActiveEnv(env.id);
                         navigate({ to: '/dashboard' });
                       }}
                    >
                       <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> {isActive ? 'Active' : 'Connect'}
                    </button>
                </div>
                
                <div className="w-12 border-l border-white/5 flex flex-col items-center justify-start py-4 bg-black/10">
                    <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded hover:bg-white/5 transition-colors group cursor-pointer" title="Edit environment">
                       <Edit className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </button>
                    <button 
                      onClick={() => removeEnv(env.id)}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded hover:bg-white/5 transition-colors group cursor-pointer" 
                      title="Delete environment"
                    >
                       <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>
          )
        })}
        {environments.length === 0 && (
           <div className="py-12 flex flex-col items-center justify-center text-slate-400 bg-[#23282D] rounded-md border border-white/5 border-dashed">
              <Server className="w-12 h-12 mb-3 opacity-20" />
              <p>No environments configured.</p>
              <Button onClick={() => setIsAddModalOpen(true)} variant="link" className="text-[#3BA5EF]">Add an environment to get started</Button>
           </div>
        )}
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

function FilterDropdown({ label, className = '' }: { label: string, className?: string }) {
  return (
    <button className={`flex items-center justify-between bg-[#252830] border border-white/10 text-slate-300 text-[13px] font-medium rounded h-9 px-3 hover:bg-[#2A2E35] hover:border-white/20 transition-all focus:outline-none focus:ring-1 focus:ring-[#3BA5EF]/50 ${className}`}>
      <span>{label}</span>
      <ChevronDown className="w-3.5 h-3.5 ml-2 text-slate-400" />
    </button>
  )
}

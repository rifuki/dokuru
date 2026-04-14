import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Activity, FileText, Menu, Shield, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';

import { DokuruEmblem } from '@/components/brand/DokuruEmblem';
import { Button } from '@/components/ui/button';

const MENU_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Activity },
  { path: '/audit', label: 'Live Audit', icon: Shield },
  { path: '/fix', label: 'Remediation', icon: Wrench },
  { path: '/report', label: 'Report', icon: FileText },
];

export function RootLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isEnvDropdownOpen, setIsEnvDropdownOpen] = useState(true);
  const location = useLocation();
  const orbARef = useRef<HTMLDivElement | null>(null);
  const orbBRef = useRef<HTMLDivElement | null>(null);
  const orbCRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const animations = [
      gsap.to(orbARef.current, {
        y: 36,
        x: 20,
        scale: 1.05,
        duration: 9,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      }),
      gsap.to(orbBRef.current, {
        y: -24,
        x: -30,
        scale: 0.92,
        duration: 11,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      }),
      gsap.to(orbCRef.current, {
        y: 28,
        x: -16,
        scale: 1.08,
        duration: 12,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      }),
    ];

    return () => {
      for (const animation of animations) {
        animation.kill();
      }
    };
  }, []);

  const isActivePath = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }

    return location.pathname.startsWith(path);
  };

  return (
    <div className="app-shell">
      {/* Background Orbs Removed for flat aesthetic */}
      <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative flex min-h-screen">
          {/* Sidebar */}
          <div className="flex w-[260px] shrink-0 h-screen flex-col border-r border-[#2C313B] bg-[#16171A]">
            <div className="flex flex-col flex-1 px-4 py-6 overflow-y-auto">
              {/* Top Home Link */}
              <Link to="/" className="flex items-center gap-3 px-3 py-2 mb-4 text-[#C1C3C6] hover:bg-white/[0.04] hover:text-white rounded transition-colors">
                <DokuruEmblem className="h-4 w-4" />
                <span className="font-medium text-[13px]">Home</span>
              </Link>

              {/* Environment Accordion Header */}
              <button 
                  onClick={() => setIsEnvDropdownOpen(!isEnvDropdownOpen)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-t-md bg-[#252830] border-b border-black/20 text-[#C1C3C6]"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-[#3BA5EF]">
                      <svg viewBox="0 0 340 268" fill="currentColor" className="w-[16px] h-[16px]">
                        <path d="M334,110.1c-8.3-5.6-30.2-8-46.1-3.7-.9-15.8-9-29.2-24-40.8l-5.5-3.7-3.7,5.6c-7.2,11-10.3,25.7-9.2,39,.8,8.2,3.7,17.4,9.2,24.1-20.7,12-39.8,9.3-124.3,9.3H0c-.4,19.1,2.7,55.8,26,85.6,2.6,3.3,5.4,6.5,8.5,9.6,19,19,47.6,32.9,90.5,33,65.4,0,121.4-35.3,155.5-120.8,11.2.2,40.8,2,55.3-26,.4-.5,3.7-7.4,3.7-7.4l-5.5-3.7h0ZM85.2,92.7h-36.7v36.7h36.7v-36.7ZM132.6,92.7h-36.7v36.7h36.7v-36.7ZM179.9,92.7h-36.7v36.7h36.7v-36.7ZM227.3,92.7h-36.7v36.7h36.7v-36.7ZM37.8,92.7H1.1v36.7h36.7v-36.7ZM85.2,46.3h-36.7v36.7h36.7v-36.7ZM132.6,46.3h-36.7v36.7h36.7v-36.7ZM179.9,46.3h-36.7v36.7h36.7v-36.7ZM179.9,0h-36.7v36.7h36.7V0Z"/>
                      </svg>
                    </div>
                    <span className="font-medium text-[13px] text-[#C1C3C6]">local</span>
                  </div>
                  <X className={`w-3.5 h-3.5 text-[#C1C3C6] ${isEnvDropdownOpen ? 'rotate-45' : ''}`} style={{ transition: 'transform 0.2s', transform: isEnvDropdownOpen ? 'rotate(0)' : 'rotate(-45deg)' }} />
                </button>
                
              <div className={`mt-0.5 bg-[#252830]/50 rounded-b-md ${isEnvDropdownOpen ? 'block' : 'hidden'}`}>
                <nav className="space-y-[2px]">
                  {MENU_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActivePath(item.path);

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`group flex items-center gap-3 px-3 py-2 transition-all ${
                          active
                            ? 'bg-white/5 text-white border-l-2 border-[#3BA5EF]'
                            : 'text-[#C1C3C6] hover:bg-white/[0.04] hover:text-white border-l-2 border-transparent'
                        }`}
                      >
                        <Icon strokeWidth={2} className="h-3.5 w-3.5 text-inherit" />
                        <span className="font-regular text-[13px]">{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="mt-8 flex-1">
                <div className="px-2 mb-3">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-slate-600">Administration</span>
                </div>
                <nav className="space-y-[2px]">
                  <button className="w-full flex items-center gap-3 rounded-lg px-3 py-[10px] text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all text-left">
                    <Activity strokeWidth={2.5} className="h-4 w-4 text-slate-500" />
                    <span className="font-medium text-[13px]">Engine Logs</span>
                  </button>
                  <button className="w-full flex items-center gap-3 rounded-lg px-3 py-[10px] text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all text-left">
                    <Shield strokeWidth={2.5} className="h-4 w-4 text-slate-500" />
                    <span className="font-medium text-[13px]">Rules Library</span>
                  </button>
                  <button className="w-full flex items-center gap-3 rounded-lg px-3 py-[10px] text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all text-left">
                    <Wrench strokeWidth={2.5} className="h-4 w-4 text-slate-500" />
                    <span className="font-medium text-[13px]">Settings</span>
                  </button>
                </nav>
              </div>

              {/* Status at the bottom */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 text-[11px] text-slate-400 mt-auto flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-[10px] font-bold text-emerald-500">
                  OK
                </div>
                <div>
                  <span className="block font-semibold text-slate-200">System Active</span>
                  <span className="block text-slate-500">v0.1.0-stable</span>
                </div>
              </div>
            </div>
          </div>

        <div className="flex min-h-screen flex-1 flex-col px-4 pb-6 pt-4 md:px-5 xl:pl-0">
          <header className="neo-card flex items-center justify-between px-4 py-3 xl:hidden">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-2">
                <DokuruEmblem className="h-9 w-9" />
              </div>
              <div>
                <span className="block text-xl font-semibold text-white">Dokuru</span>
                <span className="block text-xs text-slate-400">Docker Hardening Agent</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
          </header>

          <AnimatePresence>
            {isMobileMenuOpen ? (
              <motion.div
                className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm xl:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.aside
                  className="neo-card absolute inset-y-4 left-4 w-[min(86vw,360px)] p-5"
                  initial={{ x: -32, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -32, opacity: 0 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <DokuruEmblem className="h-10 w-10" />
                      <div>
                        <span className="block text-lg font-semibold text-white">Dokuru</span>
                        <span className="block text-xs text-slate-400">Hardening Console</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  <nav className="mt-8 space-y-2">
                    {MENU_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const active = isActivePath(item.path);

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-3 rounded-md px-4 py-3 transition-all ${active ? 'bg-[#1D1D20] text-white' : 'text-zinc-400 hover:bg-[#1D1D20] hover:text-white'}`}
                        >
                          <span className="rounded-xl border border-white/8 bg-white/5 p-2"><Icon className="h-4 w-4" /></span>
                          <div>
                            <p className="font-medium">{item.label}</p>
                            <p className="text-xs text-slate-400">{menuMeta(item.path)}</p>
                          </div>
                        </Link>
                      )
                    })}
                  </nav>
                </motion.aside>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <main className="relative flex-1 py-4 md:py-5">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function menuMeta(path: string) {
  switch (path) {
    case '/':
      return 'Posture, score, host state';
    case '/audit':
      return 'Run and inspect CIS checks';
    case '/fix':
      return 'Apply or preview remediations';
    case '/report':
      return 'Executive summary and scans';
    default:
      return 'Control plane';
  }
}

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
      <div ref={orbARef} className="pointer-events-none absolute left-[-12rem] top-[-6rem] h-[30rem] w-[30rem] rounded-full bg-sky-400/20 blur-[120px]" />
      <div ref={orbBRef} className="pointer-events-none absolute right-[-6rem] top-[8rem] h-[26rem] w-[26rem] rounded-full bg-indigo-500/20 blur-[120px]" />
      <div ref={orbCRef} className="pointer-events-none absolute bottom-[-10rem] left-[22%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/12 blur-[140px]" />
      <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative flex min-h-screen">
        <aside className="hidden w-[320px] shrink-0 p-5 xl:block">
          <div className="glass-surface panel-outline flex h-[calc(100vh-2.5rem)] flex-col rounded-[32px] px-5 py-6">
            <div className="flex items-center gap-4 px-2">
              <div className="rounded-[22px] border border-white/10 bg-slate-950/70 p-2.5 shadow-[0_14px_40px_rgba(14,165,233,0.18)]">
                <DokuruEmblem className="h-11 w-11" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Dokuru</h1>
                <p className="mt-1 text-sm text-slate-300">Docker Hardening Agent</p>
              </div>
            </div>

            <div className="mt-8 rounded-[28px] border border-white/8 bg-white/5 px-4 py-4">
              <div className="section-kicker">Security Console</div>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Assess Docker runtime posture, apply remediations safely, and verify the host hardening trail from one lightweight control plane.
              </p>
            </div>

            <nav className="mt-8 flex-1 space-y-2">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`group flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                      active
                        ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(99,102,241,0.22))] text-white shadow-[0_14px_40px_rgba(14,165,233,0.12)]'
                        : 'text-slate-300 hover:bg-white/6 hover:text-white'
                    }`}
                  >
                    <span className={`rounded-xl border p-2 transition ${active ? 'border-white/10 bg-slate-950/60 text-sky-200' : 'border-white/8 bg-white/5 text-slate-300 group-hover:border-white/12 group-hover:bg-white/8'}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-slate-400">{menuMeta(item.path)}</p>
                    </div>
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-3 rounded-[28px] border border-white/8 bg-white/5 p-4 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Version</span>
                <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-xs text-white">v0.1.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Benchmark</span>
                <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-xs text-white">CIS v1.8.0</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col px-4 pb-6 pt-4 md:px-5 xl:pl-0">
          <header className="glass-surface panel-outline flex items-center justify-between rounded-[28px] px-4 py-3 xl:hidden">
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
                  className="glass-surface panel-outline absolute inset-y-4 left-4 w-[min(86vw,360px)] rounded-[32px] p-5"
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
                          className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${active ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(99,102,241,0.22))] text-white' : 'text-slate-300 hover:bg-white/6 hover:text-white'}`}
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

          <motion.main
            key={location.pathname}
            className="relative flex-1 py-4 md:py-5"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </motion.main>
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

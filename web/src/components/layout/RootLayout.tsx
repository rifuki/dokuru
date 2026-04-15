import { Link, Outlet, useLocation } from '@tanstack/react-router';
import {
  Activity,
  BookOpen,
  FileText,
  Home,
  Menu,
  Settings,
  Shield,
  Terminal,
  X,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useEnvironmentStore } from '@/stores/environment-store';

const DockerIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 340 268" fill="currentColor" className={className}>
    <path d="M334,110.1c-8.3-5.6-30.2-8-46.1-3.7-.9-15.8-9-29.2-24-40.8l-5.5-3.7-3.7,5.6c-7.2,11-10.3,25.7-9.2,39,.8,8.2,3.7,17.4,9.2,24.1-20.7,12-39.8,9.3-124.3,9.3H0c-.4,19.1,2.7,55.8,26,85.6,2.6,3.3,5.4,6.5,8.5,9.6,19,19,47.6,32.9,90.5,33,65.4,0,121.4-35.3,155.5-120.8,11.2.2,40.8,2,55.3-26,.4-.5,3.7-7.4,3.7-7.4l-5.5-3.7h0ZM85.2,92.7h-36.7v36.7h36.7v-36.7ZM132.6,92.7h-36.7v36.7h36.7v-36.7ZM179.9,92.7h-36.7v36.7h36.7v-36.7ZM227.3,92.7h-36.7v36.7h36.7v-36.7ZM37.8,92.7H1.1v36.7h36.7v-36.7ZM85.2,46.3h-36.7v36.7h36.7v-36.7ZM132.6,46.3h-36.7v36.7h36.7v-36.7ZM179.9,46.3h-36.7v36.7h36.7v-36.7ZM179.9,0h-36.7v36.7h36.7V0Z" />
  </svg>
);

const ENV_MENU_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: Activity },
  { path: '/audit', label: 'Live Audit', icon: Shield },
  { path: '/report', label: 'Report', icon: FileText },
];

const ADMIN_ITEMS = [
  { label: 'Engine Logs', icon: Terminal },
  { label: 'Rules Library', icon: BookOpen },
  { label: 'Settings', icon: Settings },
];

export function RootLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isEnvOpen, setIsEnvOpen] = useState(true);
  const location = useLocation();

  const environments = useEnvironmentStore(s => s.environments);
  const activeEnvId = useEnvironmentStore(s => s.activeEnvironmentId);
  const activeEnv = environments.find(e => e.id === activeEnvId);

  const isActivePath = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isHome = location.pathname === '/';

  return (
    <div className="flex min-h-screen bg-[#212529]">
      {/* ─── Sidebar ─── */}
      <aside className="hidden xl:flex w-[250px] shrink-0 h-screen sticky top-0 flex-col bg-[#1A1D21] border-r border-[#2D3239]">
        {/* Brand */}
        <div className="px-4 h-14 flex items-center border-b border-[#2D3239]">
          <span className="text-[15px] font-bold tracking-tight text-white">DOKURU</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {/* Home */}
          <Link
            to="/"
            className={`flex items-center gap-2.5 px-3 py-2 rounded text-[13px] cursor-pointer transition-colors ${isHome
              ? 'bg-[#3BA5EF]/10 text-[#3BA5EF]'
              : 'text-[#9CA3AF] hover:bg-white/[0.04] hover:text-white'
              }`}
          >
            <Home className="w-4 h-4" />
            <span className="font-medium">Home</span>
          </Link>

          {/* Environment Section */}
          <div className="mt-3">
            <button
              onClick={() => setIsEnvOpen(!isEnvOpen)}
              className={`w-full flex items-center justify-between px-3 py-2 cursor-pointer text-[13px] text-white transition-colors ${isEnvOpen ? 'bg-[#252830] rounded-t-md border-x border-t border-white/5' : 'hover:bg-white/[0.04] rounded'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <DockerIcon className="w-4 h-4 text-[#3BA5EF]" />
                <span className="font-medium truncate max-w-[140px]">{activeEnv?.name || 'No Environment'}</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#6B7280] transition-transform ${isEnvOpen ? '' : '-rotate-90'}`} />
            </button>

            {isEnvOpen && (
              <div className="bg-[#252830]/60 rounded-b-md border-x border-b border-white/5 pb-1">
                {ENV_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = !isHome && isActivePath(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2.5 pl-7 pr-3 py-[7px] text-[13px] cursor-pointer transition-colors ${active
                        ? 'bg-[#3BA5EF]/10 text-[#3BA5EF] border-l-2 border-[#3BA5EF] -ml-[2px] pl-[26px]'
                        : 'text-[#9CA3AF] hover:bg-white/[0.04] hover:text-white'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Administration */}
          <div className="mt-6">
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-widest uppercase text-[#6B7280]">Administration</p>
            {ADMIN_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded text-[13px] text-[#9CA3AF] hover:bg-white/[0.04] hover:text-white cursor-pointer transition-colors text-left"
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* ─── Main content ─── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="xl:hidden flex items-center justify-between px-4 h-12 bg-[#1A1D21] border-b border-[#2D3239]">
          <span className="text-sm font-bold text-white">DOKURU</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9CA3AF] hover:text-white cursor-pointer"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </header>

        {/* Mobile menu overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 xl:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-[#1A1D21] border-r border-[#2D3239] p-4">
              <div className="flex items-center justify-between mb-6">
                <span className="text-sm font-bold text-white">DOKURU</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-[#9CA3AF] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-1">
                <Link
                  to="/"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded text-[13px] text-[#9CA3AF] hover:bg-white/[0.04] hover:text-white cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  <span className="font-medium">Home</span>
                </Link>
                {ENV_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded text-[13px] text-[#9CA3AF] hover:bg-white/[0.04] hover:text-white cursor-pointer"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

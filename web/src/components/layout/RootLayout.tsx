import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Shield, Activity, Wrench, FileText, Menu } from 'lucide-react';
import { useState } from 'react';
import { WS_BASE_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import React from 'react';

const MENU_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Activity },
  { path: '/audit', label: 'Live Audit', icon: Shield },
  { path: '/fix', label: 'Auto Fix', icon: Wrench },
  { path: '/report', label: 'Report', icon: FileText },
];

export function RootLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Hook up global WebSocket to sync audit state across pages if needed,
  // or handle per-page. For Dokuru, a global sync is nice.
  React.useEffect(() => {
    const ws = new WebSocket(`${WS_BASE_URL}/audit`);
    ws.onmessage = () => {
       // Live update logic goes here...
    };
    return () => ws.close();
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card/50 backdrop-blur-sm">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
            D
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Dokuru</h1>
            <p className="text-xs text-muted-foreground">Security Agent</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          {MENU_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md transition-colors ${
                  isActive 
                    ? 'bg-primary text-primary-foreground' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t">
          <p className="text-xs text-center text-muted-foreground">Dokuru v0.1.0 • CIS v1.8.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center space-x-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="font-bold">Dokuru</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            <Menu className="w-5 h-5" />
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8 relative">
          {/* Subtle gradient background decoration for premium feel */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

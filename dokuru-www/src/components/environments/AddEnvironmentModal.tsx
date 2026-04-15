import React, { useState } from 'react';
import { X, Server, Globe, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { useEnvironmentStore, EnvironmentType, Environment } from '@/stores/environment-store';

interface AddEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddEnvironmentModal({ isOpen, onClose }: AddEnvironmentModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<EnvironmentType>('docker_standalone');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { addEnvironment, setActiveEnvironment } = useEnvironmentStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic validation
    if (!name.trim()) {
      setError('Environment name is required');
      setLoading(false);
      return;
    }

    let parsedUrl = url.trim();
    if (!parsedUrl) {
      setError('Environment URL is required');
      setLoading(false);
      return;
    }

    if (!parsedUrl.startsWith('http://') && !parsedUrl.startsWith('https://')) {
      parsedUrl = `http://${parsedUrl}`;
    }

    try {
      const res = await axios.post<{ data: Environment }>(`${parsedUrl}/api/v1/environments`, {
        name: name.trim(),
        url: parsedUrl,
        type,
      });
      const newEnv = res.data.data;

      addEnvironment(newEnv);
      setActiveEnvironment(newEnv.id);
      
      // Reset & Close
      setName('');
      setUrl('');
      setType('docker_standalone');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect to the remote environment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-[#1E2125] w-full max-w-lg rounded-md border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#23282D]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-[#3BA5EF]" />
            Add Environment
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
          {error && (
            <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-300">Name</label>
            <input
              type="text"
              placeholder="e.g. Production Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 bg-[#15171A] border border-white/10 rounded px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#3BA5EF]/50 focus:ring-1 focus:ring-[#3BA5EF]/50 transition-colors"
            />
            <p className="text-[12px] text-slate-500">A friendly identifier for this environment.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-300">Agent URL</label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="http://192.168.1.50:3939"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full h-10 bg-[#15171A] border border-white/10 rounded pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#3BA5EF]/50 focus:ring-1 focus:ring-[#3BA5EF]/50 transition-colors font-mono"
              />
            </div>
            <p className="text-[12px] text-slate-500">The HTTP address where Dokuru Agent is running on the target machine.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-300">Environment Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EnvironmentType)}
              className="w-full h-10 bg-[#15171A] border border-white/10 rounded px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#3BA5EF]/50 focus:ring-1 focus:ring-[#3BA5EF]/50 transition-colors cursor-pointer appearance-none"
            >
              <option value="docker_standalone">Docker Standalone</option>
              <option value="docker_swarm">Docker Swarm</option>
              <option value="podman">Podman</option>
            </select>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-white/5 mt-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="text-slate-300 hover:text-white cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#3BA5EF] hover:bg-[#3BA5EF]/90 text-white border-none cursor-pointer flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Connect Environment
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

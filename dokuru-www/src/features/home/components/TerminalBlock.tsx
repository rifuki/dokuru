import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function TerminalBlock() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"api" | "ui">("api");

  const copyToClipboard = (command: string) => {
    navigator.clipboard.writeText(command).then(() => {
      setCopiedCommand(command);
      toast.success("Copied to clipboard!", {
        description: command,
        duration: 2000,
      });
      setTimeout(() => setCopiedCommand(null), 2000);
    });
  };

  return (
    <div className="max-w-lg mx-auto mb-10">
      <div className="bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 text-left shadow-2xl">
        <div className="flex items-center justify-between px-4 bg-zinc-900/80 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5 py-3">
              <div className="w-3 h-3 rounded-full bg-miku-accent"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("api")}
                className={`px-3 py-2.5 text-xs font-mono transition-colors border-b-2 ${activeTab === "api"
                  ? "text-zinc-100 border-miku-primary"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
                  }`}
              >
                terminal 1 (api)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ui")}
                className={`px-3 py-2.5 text-xs font-mono transition-colors border-b-2 ${activeTab === "ui"
                  ? "text-zinc-100 border-miku-secondary"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
                  }`}
              >
                terminal 2 (ui)
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 font-mono text-sm space-y-4 text-zinc-300 min-h-[180px]">
          {activeTab === "api" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start justify-between group">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-4">
                  <div className="flex gap-2">
                    <span className="text-miku-primary-light shrink-0">$</span>
                    <span className="text-zinc-100">
                      git clone https://github.com/rifuki/dokuru.git
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-miku-primary-light shrink-0">$</span>
                    <span className="text-zinc-100">cd dokuru/dokuru-server</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-miku-primary-light shrink-0">$</span>
                    <span className="text-zinc-100">
                      cp .env.example .env
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-miku-primary-light shrink-0">$</span>
                    <span className="text-zinc-100">
                      docker compose --profile db up -d
                    </span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <span className="text-miku-primary-light shrink-0">$</span>
                    <span className="text-zinc-100">cargo run</span>
                  </div>
                  <div className="text-zinc-500">
                    # API running at http://localhost:8080
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                  onClick={() =>
                    copyToClipboard(
                      "git clone https://github.com/rifuki/dokuru.git\ncd dokuru/dokuru-server\ncp .env.example .env\ndocker compose up -d\ncargo run",
                    )
                  }
                >
                  {copiedCommand ===
                    "git clone https://github.com/rifuki/dokuru.git\ncd dokuru/dokuru-server\ncp .env.example .env\ndocker compose up -d\ncargo run" ? (
                    <Check className="h-3 w-3 text-miku-primary" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start justify-between group">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-4">
                  <div className="flex gap-2">
                    <span className="text-miku-secondary-light shrink-0">$</span>
                    <span className="text-zinc-100">cd dokuru/dokuru-www</span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <span className="text-miku-secondary-light shrink-0">$</span>
                    <span className="text-zinc-100">
                      npm i && npm run dev
                    </span>
                  </div>
                  <div className="text-zinc-500">
                    # UI running at http://localhost:5173
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                  onClick={() =>
                    copyToClipboard("cd quax/ui\nnpm i && npm run dev")
                  }
                >
                  {copiedCommand ===
                    "cd quax/ui\nnpm i && npm run dev" ? (
                    <Check className="h-3 w-3 text-miku-primary" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

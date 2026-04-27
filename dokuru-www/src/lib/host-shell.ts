export const HOST_SHELL_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_HOST_SHELL === "true";

export const HOST_SHELLS = ["/bin/zsh", "/bin/bash", "/bin/sh"] as const;

export type HostShellPath = (typeof HOST_SHELLS)[number];

export function normalizeHostShell(shell: string | null | undefined): HostShellPath {
  return HOST_SHELLS.includes(shell as HostShellPath) ? shell as HostShellPath : "/bin/sh";
}

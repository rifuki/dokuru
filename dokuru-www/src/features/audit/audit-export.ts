import type { AuditResponse } from "@/lib/api/agent-direct";

function slugifyFilePart(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "audit";
}

export function buildAuditJsonFilename(audit: AuditResponse) {
  const date = new Date(audit.timestamp);
  const stamp = Number.isNaN(date.getTime()) ? "audit" : date.toISOString().slice(0, 10);

  return `dokuru-audit-${slugifyFilePart(audit.hostname)}-${stamp}.json`;
}

export function downloadAuditJson(audit: AuditResponse) {
  const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildAuditJsonFilename(audit);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

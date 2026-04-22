import { httpApiUrl } from "@/lib/api/api-config";
import { useAuthStore } from "@/stores/use-auth-store";

const CACHE_NAME = "dokuru-pdf-v1";

async function fetchFromServer(): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${httpApiUrl}/admin/documents/file`, {
    headers,
    credentials: "include",
  });

  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  return response.blob();
}

/**
 * Returns the PDF blob for the given document ID.
 * Checks Cache API first — if cached, returns instantly without a network request.
 * Falls back to a direct server fetch if Cache API is unavailable (e.g. private mode).
 */
export async function getOrFetchPdfBlob(docId: string): Promise<Blob> {
  const cacheKey = `/dokuru-cache/pdf-${docId}`;

  if ("caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(cacheKey);
      if (cached) return cached.blob();

      const blob = await fetchFromServer();
      // Store a clone — the original blob is still returned to the caller
      await cache.put(
        cacheKey,
        new Response(blob.slice(0), {
          headers: { "Content-Type": "application/pdf" },
        })
      );
      return blob;
    } catch {
      // Cache API failure — fall through to direct fetch
    }
  }

  return fetchFromServer();
}

/**
 * Removes the cached PDF for a given document ID.
 * Call this after replacing or deleting a document.
 */
export async function invalidatePdfCache(docId: string): Promise<void> {
  if ("caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(`/dokuru-cache/pdf-${docId}`);
    } catch {
      // Ignore
    }
  }
}

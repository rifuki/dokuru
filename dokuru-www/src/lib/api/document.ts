import apiClient from "./axios-instance";
import { httpApiUrl } from "./api-config";
import { useAuthStore } from "@/stores/use-auth-store";

export interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

export const documentApi = {
  getCurrent: async (): Promise<Document | null> => {
    const response = await apiClient.get("/admin/documents");
    return response.data.data;
  },

  // Use native fetch so the browser sets multipart/form-data + boundary automatically.
  // Axios default Content-Type: application/json header cannot be reliably
  // removed per-request via AxiosHeaders, which corrupts the multipart boundary.
  upload: async (file: File): Promise<Document> => {
    const formData = new FormData();
    formData.append("file", file);

    const token = useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${httpApiUrl}/admin/documents`, {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Upload failed" }));
      return Promise.reject(errorData);
    }

    const data = await response.json();
    return data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/documents/${id}`);
  },
};

export const userDocumentApi = {
  getCurrent: async (): Promise<Document | null> => {
    const response = await apiClient.get("/documents");
    return response.data.data;
  },
};

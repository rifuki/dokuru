import { apiClient } from "./axios-instance";

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

  upload: async (file: File): Promise<Document> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await apiClient.post("/admin/documents", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/documents/${id}`);
  },
};

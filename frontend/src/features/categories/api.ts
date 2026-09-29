import { api } from "@/lib/apiClient";
import type { Category } from "@/lib/types";

export interface CategoryInput {
  name: string;
  color: string;
}

export const categoriesApi = {
  list: () => api.get<Category[]>("/categories").then((r) => r.data),
  create: (input: CategoryInput) => api.post<Category>("/categories", input).then((r) => r.data),
  update: (id: number, input: Partial<CategoryInput>) =>
    api.patch<Category>(`/categories/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/categories/${id}`),
};

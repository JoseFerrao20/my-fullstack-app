import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { categoriesApi, type CategoryInput } from "@/features/categories/api";

export const categoriesKey = ["categories"] as const;

export function useCategories() {
  return useQuery({ queryKey: categoriesKey, queryFn: categoriesApi.list });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: categoriesKey });
    // Tasks embed their category, so they're stale too.
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
}

export function useCreateCategory() {
  const onSuccess = useInvalidate();
  return useMutation({ mutationFn: categoriesApi.create, onSuccess });
}

export function useUpdateCategory() {
  const onSuccess = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CategoryInput> & { id: number }) => categoriesApi.update(id, input),
    onSuccess,
  });
}

export function useDeleteCategory() {
  const onSuccess = useInvalidate();
  return useMutation({ mutationFn: categoriesApi.remove, onSuccess });
}

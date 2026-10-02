import { forwardRef, type SelectHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui/Field";
import { useCategories } from "@/features/categories/hooks";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  emptyLabel?: string;
};

/** Category dropdown. The empty option has value "". */
export const CategorySelect = forwardRef<HTMLSelectElement, Props>(function CategorySelect(
  { emptyLabel, ...props },
  ref,
) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  return (
    <Select ref={ref} {...props}>
      <option value="">{emptyLabel ?? t("categories.none")}</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
});

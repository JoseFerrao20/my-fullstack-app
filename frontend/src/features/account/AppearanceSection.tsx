import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui/Field";
import { setTheme, storedTheme, type Theme } from "@/lib/theme";

export function AppearanceSection() {
  const { t } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(storedTheme);

  return (
    <section aria-labelledby="settings-appearance" className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <h2 id="settings-appearance" className="text-lg font-semibold text-slate-900">
        {t("appearance.title")}
      </h2>
      <div className="max-w-xs">
        <Select
          label={t("appearance.theme")}
          value={theme}
          onChange={(e) => {
            const next = e.target.value as Theme;
            setThemeState(next);
            setTheme(next);
          }}
        >
          <option value="system">{t("appearance.system")}</option>
          <option value="light">{t("appearance.light")}</option>
          <option value="dark">{t("appearance.dark")}</option>
        </Select>
      </div>
    </section>
  );
}

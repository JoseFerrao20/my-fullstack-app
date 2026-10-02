import { useTranslation } from "react-i18next";
import { useMe, useUpdateProfile } from "@/features/auth/hooks";
import { currentLanguage, LANGUAGES, setLanguage, type Language } from "@/lib/i18n";

const NAMES: Record<Language, string> = { pt: "Português", en: "English" };

/** Compact language picker. When logged in, the choice is saved to the profile too. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();

  const change = (language: Language) => {
    setLanguage(language);
    if (user) updateProfile.mutate({ locale: language });
  };

  return (
    <select
      aria-label={t("app.language")}
      value={currentLanguage()}
      onChange={(e) => change(e.target.value as Language)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
    >
      {LANGUAGES.map((lng) => (
        <option key={lng} value={lng} lang={lng}>
          {NAMES[lng]}
        </option>
      ))}
    </select>
  );
}

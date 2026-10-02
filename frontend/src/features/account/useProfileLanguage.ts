import { useEffect } from "react";
import { useMe } from "@/features/auth/hooks";
import { currentLanguage, setLanguage } from "@/lib/i18n";

/** Once the user is known, their saved language (if any) wins over this browser's. */
export function useProfileLanguage() {
  const { data: user } = useMe();
  const locale = user?.locale;

  useEffect(() => {
    if (locale && locale !== currentLanguage()) setLanguage(locale);
  }, [locale]);
}

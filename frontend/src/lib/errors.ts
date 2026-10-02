import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/apiClient";

/**
 * A user-facing message for any error: known server codes are translated,
 * other server messages are shown as sent, and anything else is generic.
 */
export function errorMessage(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError)) return t("errors.generic");
  if (err.code === "TOO_MANY_REQUESTS") {
    const seconds = (err.details as { retryAfter?: number } | null)?.retryAfter ?? 60;
    return t("errors.TOO_MANY_REQUESTS", { count: Math.ceil(seconds / 60) });
  }
  const key = `errors.${err.code}` as const;
  return t(key as "errors.generic", { defaultValue: err.message });
}

export function useErrorMessage() {
  const { t } = useTranslation();
  return (err: unknown) => errorMessage(err, t);
}

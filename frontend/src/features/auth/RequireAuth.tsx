import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "@/features/auth/hooks";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: user, isPending, isError } = useMe();
  const location = useLocation();

  if (isPending) {
    return <p className="p-8 text-center text-slate-500">{t("app.loading")}</p>;
  }
  if (isError) {
    return <p className="p-8 text-center text-red-600">{t("app.serverUnreachable")}</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

import { useTranslation } from "react-i18next";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/features/account/LanguageSwitcher";
import { useProfileLanguage } from "@/features/account/useProfileLanguage";
import { useLogout, useMe } from "@/features/auth/hooks";
import { NotificationBell } from "@/features/notifications/NotificationBell";

export function Layout() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  useProfileLanguage();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold text-indigo-600">
            {t("app.name")}
          </Link>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link
              to="/settings"
              title={t("settings.link")}
              className="hidden items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
            >
              <span aria-hidden="true">⚙</span>
              {user?.name}
              <span className="sr-only">· {t("settings.link")}</span>
            </Link>
            <LanguageSwitcher />
            <Button
              variant="secondary"
              disabled={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
            >
              {t("app.logOut")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

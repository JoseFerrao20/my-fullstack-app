import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { NotificationsSection } from "@/features/account/NotificationsSection";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { useChangePassword, useDeleteAccount, useLogoutAll, useMe, useUpdateProfile } from "@/features/auth/hooks";
import { changePasswordSchema as passwordSchema } from "@/features/auth/passwordSchema";
import { ApiError } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";
import { LANGUAGES, setLanguage, type Language } from "@/lib/i18n";
import type { User } from "@/lib/types";

const LANGUAGE_NAMES: Record<Language, string> = { pt: "Português", en: "English" };

function Section({ title, children, danger = false }: { title: string; children: ReactNode; danger?: boolean }) {
  const id = `settings-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section
      aria-labelledby={id}
      className={`space-y-4 rounded-lg bg-white p-6 shadow-sm ${danger ? "border border-red-200" : ""}`}
    >
      <h2 id={id} className={`text-lg font-semibold ${danger ? "text-red-700" : "text-slate-900"}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Feedback({ error, success }: { error?: unknown; success?: string | false }) {
  const errorMessage = useErrorMessage();
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {errorMessage(error)}
      </p>
    );
  }
  return success ? (
    <p role="status" className="text-sm text-emerald-700">
      {success}
    </p>
  ) : null;
}

function ProfileSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [locale, setLocale] = useState<Language | "">(user.locale ?? "");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const chosen = locale || null;
    update.mutate({ name: name.trim(), locale: chosen }, { onSuccess: () => setLanguage(chosen) });
  };

  return (
    <Section title={t("settings.profile")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label={t("settings.email")} value={user.email} disabled readOnly />
        <Input label={t("settings.name")} value={name} maxLength={100} required onChange={(e) => setName(e.target.value)} />
        <Select label={t("settings.language")} value={locale} onChange={(e) => setLocale(e.target.value as Language | "")}>
          <option value="">{t("settings.followBrowser")}</option>
          {LANGUAGES.map((lng) => (
            <option key={lng} value={lng} lang={lng}>
              {LANGUAGE_NAMES[lng]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending || !name.trim()}>
            {update.isPending ? t("settings.saving") : t("settings.save")}
          </Button>
          <Feedback error={update.error} success={update.isSuccess && t("settings.saved")} />
        </div>
      </form>
    </Section>
  );
}

type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordSection() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = handleSubmit(({ currentPassword, newPassword }) =>
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => reset({ currentPassword: "", newPassword: "", confirmPassword: "" }),
        onError: (err) => {
          if (err instanceof ApiError && err.code === "INVALID_PASSWORD") {
            setError("currentPassword", { message: "errors.INVALID_PASSWORD" });
          }
        },
      },
    ),
  );

  const wrongPassword = change.error instanceof ApiError && change.error.code === "INVALID_PASSWORD";

  return (
    <Section title={t("settings.password")}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input
          label={t("settings.currentPassword")}
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
        <Input
          label={t("settings.newPassword")}
          type="password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <Input
          label={t("settings.confirmPassword")}
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? t("settings.saving") : t("settings.changePassword")}
          </Button>
          <Feedback
            error={wrongPassword ? undefined : change.error}
            success={change.isSuccess && t("settings.passwordChanged")}
          />
        </div>
      </form>
    </Section>
  );
}

function SessionsSection() {
  const { t } = useTranslation();
  const logoutAll = useLogoutAll();
  const navigate = useNavigate();

  return (
    <Section title={t("settings.sessions")}>
      <p className="text-sm text-slate-600">{t("settings.sessionsHint")}</p>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          disabled={logoutAll.isPending}
          onClick={() => {
            if (confirm(t("settings.confirmLogoutAll"))) {
              logoutAll.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) });
            }
          }}
        >
          {t("settings.logoutAll")}
        </Button>
        <Feedback error={logoutAll.error} />
      </div>
    </Section>
  );
}

function DeleteAccountSection() {
  const { t } = useTranslation();
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password || !confirm(t("settings.confirmDelete"))) return;
    remove.mutate(password, { onSuccess: () => navigate("/signup", { replace: true }) });
  };

  const wrongPassword = remove.error instanceof ApiError && remove.error.code === "INVALID_PASSWORD";

  return (
    <Section title={t("settings.danger")} danger>
      <p className="text-sm text-slate-600">{t("settings.dangerHint")}</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label={t("settings.deletePassword")}
          type="password"
          autoComplete="current-password"
          value={password}
          error={wrongPassword ? "errors.INVALID_PASSWORD" : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="danger" disabled={!password || remove.isPending}>
            {remove.isPending ? t("settings.deleting") : t("settings.deleteButton")}
          </Button>
          <Feedback error={wrongPassword ? undefined : remove.error} />
        </div>
      </form>
    </Section>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  if (!user) return null; // RequireAuth guarantees a user; this only narrows the type.

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t("settings.title")}</h1>
      <ProfileSection user={user} />
      <NotificationsSection />
      <PasswordSection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
}

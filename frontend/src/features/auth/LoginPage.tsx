import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { useLogin, useMe } from "@/features/auth/hooks";
import { useErrorMessage } from "@/lib/errors";

const schema = z.object({
  email: z.email("validation.emailInvalid"),
  password: z.string().min(1, "validation.passwordRequired"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; notice?: "passwordChanged" } | null;
  const from = state?.from ?? "/";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) }),
  );

  return (
    <AuthLayout
      title={t("auth.logIn")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link to="/signup" className="font-medium text-indigo-600 hover:underline">
            {t("auth.signUp")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {state?.notice === "passwordChanged" && !login.error && (
          <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            {t("auth.passwordChangedNotice")}
          </p>
        )}
        {login.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errorMessage(login.error)}
          </p>
        )}
        <Input
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label={t("auth.password")}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <p className="-mt-2 text-right text-sm">
          <Link to="/forgot-password" className="text-indigo-600 hover:underline">
            {t("auth.forgotLink")}
          </Link>
        </p>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? t("auth.loggingIn") : t("auth.logIn")}
        </Button>
      </form>
    </AuthLayout>
  );
}

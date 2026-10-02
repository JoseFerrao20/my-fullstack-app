import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { useMe, useSignup } from "@/features/auth/hooks";
import { ApiError } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";
import { currentLanguage } from "@/lib/i18n";

const schema = z.object({
  name: z.string().trim().min(1, "validation.nameRequired").max(100),
  email: z.email("validation.emailInvalid"),
  password: z.string().min(8, "validation.passwordMin").max(128),
});

type FormValues = z.infer<typeof schema>;

export function SignupPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data: user } = useMe();
  const signup = useSignup();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit((values) =>
    // The language in use at signup becomes the account's language (also used for emails).
    signup.mutate(
      { ...values, locale: currentLanguage() },
      {
        onSuccess: () => navigate("/", { replace: true }),
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.code === "EMAIL_TAKEN") setError("email", { message: errorMessage(err) });
            for (const fe of err.fieldErrors) {
              if (fe.field in schema.shape) setError(fe.field as keyof FormValues, { message: fe.message });
            }
          }
        },
      },
    ),
  );

  const generalError =
    signup.error &&
    !(signup.error instanceof ApiError && (signup.error.code === "EMAIL_TAKEN" || signup.error.fieldErrors.length))
      ? errorMessage(signup.error)
      : null;

  return (
    <AuthLayout
      title={t("auth.createAccount")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">
            {t("auth.logIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {generalError && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {generalError}
          </p>
        )}
        <Input label={t("auth.name")} autoComplete="name" error={errors.name?.message} {...register("name")} />
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? t("auth.signingUp") : t("auth.signUp")}
        </Button>
      </form>
    </AuthLayout>
  );
}

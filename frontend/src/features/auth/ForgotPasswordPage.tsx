import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { authApi } from "@/features/auth/api";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { useErrorMessage } from "@/lib/errors";
import { currentLanguage } from "@/lib/i18n";

const schema = z.object({ email: z.email("validation.emailInvalid") });
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const request = useMutation({ mutationFn: authApi.requestPasswordReset });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // The server answers the same way for unknown addresses, and so do we.
  const onSubmit = handleSubmit(({ email }) => request.mutate({ email, locale: currentLanguage() }));

  const backToLogin = (
    <Link to="/login" className="font-medium text-indigo-600 hover:underline">
      {t("forgot.backToLogin")}
    </Link>
  );

  return (
    <AuthLayout title={t("forgot.title")} footer={backToLogin}>
      {request.isSuccess ? (
        <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          {t("forgot.sent", { email: request.variables.email })}
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <p className="text-sm text-slate-600">{t("forgot.intro")}</p>
          {request.error && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {errorMessage(request.error)}
            </p>
          )}
          <Input
            label={t("auth.email")}
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Button type="submit" className="w-full" disabled={request.isPending}>
            {request.isPending ? t("forgot.sending") : t("forgot.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

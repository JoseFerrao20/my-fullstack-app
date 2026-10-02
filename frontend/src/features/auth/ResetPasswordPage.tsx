import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { authApi } from "@/features/auth/api";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { resetPasswordSchema as schema } from "@/features/auth/passwordSchema";
import { ApiError } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const token = useSearchParams()[0].get("token");
  const confirm = useMutation({ mutationFn: authApi.confirmPasswordReset });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const requestNewLink = (
    <Link to="/forgot-password" className="font-medium text-indigo-600 hover:underline">
      {t("reset.requestNew")}
    </Link>
  );

  if (!token) {
    return (
      <AuthLayout title={t("reset.title")} footer={requestNewLink}>
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {t("reset.missingToken")}
        </p>
      </AuthLayout>
    );
  }

  const onSubmit = handleSubmit(({ newPassword }) =>
    confirm.mutate(
      { token, newPassword },
      // Every session was ended, so log in again with the new password.
      { onSuccess: () => navigate("/login", { replace: true, state: { notice: "passwordChanged" } }) },
    ),
  );

  const badLink = confirm.error instanceof ApiError && confirm.error.code === "INVALID_RESET_TOKEN";

  return (
    <AuthLayout title={t("reset.title")} footer={requestNewLink}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {confirm.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errorMessage(confirm.error)} {badLink && requestNewLink}
          </p>
        )}
        <Input
          label={t("reset.newPassword")}
          type="password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <Input
          label={t("reset.confirmPassword")}
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Button type="submit" className="w-full" disabled={confirm.isPending}>
          {confirm.isPending ? t("reset.saving") : t("reset.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}

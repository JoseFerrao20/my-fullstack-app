import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { useLogin, useMe } from "@/features/auth/hooks";
import { ApiError } from "@/lib/apiClient";

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

function loginErrorMessage(err: Error): string {
  if (!(err instanceof ApiError)) return "Something went wrong";
  if (err.code === "TOO_MANY_REQUESTS") {
    const seconds = (err.details as { retryAfter?: number } | undefined)?.retryAfter ?? 60;
    const minutes = Math.ceil(seconds / 60);
    return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return err.message;
}

export function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) }),
  );

  const serverError = login.error ? loginErrorMessage(login.error) : null;

  return (
    <AuthLayout
      title="Log in"
      footer={
        <>
          No account?{" "}
          <Link to="/signup" className="font-medium text-indigo-600 hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {serverError}
          </p>
        )}
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { useMe, useSignup } from "@/features/auth/hooks";
import { ApiError } from "@/lib/apiClient";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

type FormValues = z.infer<typeof schema>;

export function SignupPage() {
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
    signup.mutate(values, {
      onSuccess: () => navigate("/", { replace: true }),
      onError: (err) => {
        if (err instanceof ApiError) {
          if (err.code === "EMAIL_TAKEN") setError("email", { message: err.message });
          for (const fe of err.fieldErrors) {
            if (fe.field in schema.shape) setError(fe.field as keyof FormValues, { message: fe.message });
          }
        }
      },
    }),
  );

  const generalError =
    signup.error && !(signup.error instanceof ApiError && (signup.error.code === "EMAIL_TAKEN" || signup.error.fieldErrors.length))
      ? signup.error.message
      : null;

  return (
    <AuthLayout
      title="Create an account"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">
            Log in
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
        <Input label="Name" autoComplete="name" error={errors.name?.message} {...register("name")} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? "Creating account…" : "Sign up"}
        </Button>
      </form>
    </AuthLayout>
  );
}

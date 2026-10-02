import { api } from "@/lib/apiClient";
import type { Language } from "@/lib/i18n";
import type { User } from "@/lib/types";

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput extends LoginInput {
  name: string;
  locale: Language;
}

export interface ProfileInput {
  name?: string;
  /** null = follow the browser language. */
  locale?: Language | null;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

// Endpoints used while logged out skip the refresh-and-retry dance.
const anon = { skipRefresh: true } as const;

export const authApi = {
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  login: (input: LoginInput) => api.post<User>("/auth/login", input, anon).then((r) => r.data),
  signup: (input: SignupInput) => api.post<User>("/auth/signup", input, anon).then((r) => r.data),
  logout: () => api.post<null>("/auth/logout", undefined, anon),
  logoutAll: () => api.post<null>("/auth/logout-all"),
  updateProfile: (input: ProfileInput) => api.patch<User>("/auth/me", input).then((r) => r.data),
  requestPasswordReset: (input: { email: string; locale: Language }) =>
    api.post<null>("/auth/password-reset/request", input, anon),
  confirmPasswordReset: (input: { token: string; newPassword: string }) =>
    api.post<null>("/auth/password-reset/confirm", input, anon),
  changePassword: (input: PasswordChangeInput) => api.post<null>("/auth/password", input),
  deleteAccount: (password: string) => api.delete("/auth/me", { password }),
};

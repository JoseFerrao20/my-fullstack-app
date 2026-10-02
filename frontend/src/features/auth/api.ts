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

export const authApi = {
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  login: (input: LoginInput) => api.post<User>("/auth/login", input, { skipRefresh: true }).then((r) => r.data),
  signup: (input: SignupInput) => api.post<User>("/auth/signup", input, { skipRefresh: true }).then((r) => r.data),
  logout: () => api.post<null>("/auth/logout", undefined, { skipRefresh: true }),
  updateProfile: (input: ProfileInput) => api.patch<User>("/auth/me", input).then((r) => r.data),
};

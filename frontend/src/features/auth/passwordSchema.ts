import { z } from "zod";

const newPassword = z.string().min(8, "validation.passwordMin").max(128);

const passwordsMatch = (v: { newPassword: string; confirmPassword: string }) => v.newPassword === v.confirmPassword;
const mismatch = { message: "validation.passwordsDontMatch", path: ["confirmPassword"] };

/** Reset form: new password + confirmation. */
export const resetPasswordSchema = z
  .object({ newPassword, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

/** Settings form: current password + new password + confirmation. */
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "validation.passwordRequired"), newPassword, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

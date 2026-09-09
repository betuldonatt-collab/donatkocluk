import { z } from "zod";

// Security Hardening (Group 3 -- Zod Input Validation): shared primitives
// so every action validates the same shape of thing (a uuid, a password,
// bounded free text) the same way, instead of each file re-deriving its
// own ad-hoc checks. Kept intentionally small -- action-specific shapes
// still live next to the action that uses them, per this repo's existing
// convention of colocating small types with their action file.

// Every id this app passes around (student_id, task_id, resource_id, ...)
// is a Postgres uuid column -- a non-uuid string can never match a real
// row, but validating up front turns "silently matched nothing" into a
// clear rejection before a query is even built.
export const uuidSchema = z.string().uuid("Geçersiz kimlik.");

// Group 2 -- Password Policy Enforcement: minimum 6 characters, enforced
// through this one schema everywhere a new password is accepted (student
// settings, admin manual reset, coach/parent settings).
export const passwordSchema = z.string().min(6, "Şifre en az 6 karakter olmalı.");

export function nonEmptyText(maxLength: number, label = "Bu alan") {
  return z
    .string()
    .trim()
    .min(1, `${label} boş olamaz.`)
    .max(maxLength, `${label} en fazla ${maxLength} karakter olabilir.`);
}

// Formats a ZodError into ONE short Turkish message safe to show a user --
// never the raw Zod issue array (paths, codes, technical wording), same
// "don't leak internals" spirit as dbError (lib/errors.ts).
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Geçersiz veri girildi.";
}

// Parses input against a schema and throws a clean, user-safe error on
// failure -- the standard entry point for every action below instead of
// each one hand-rolling its own try/catch around schema.parse().
export function parseInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error(firstIssueMessage(result.error));
  return result.data;
}

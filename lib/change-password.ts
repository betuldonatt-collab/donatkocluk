"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError } from "@/lib/errors";
import { normalizeTurkishPhone } from "@/lib/phone";
import { parseInput, passwordSchema } from "@/lib/validation";
import { checkLockout, clearFailedAttempts, LOCKOUT_MESSAGE, recordFailedAttempt } from "@/lib/login-lockout";

// Shared by every panel's own changePassword action (admin/coach/parent/
// student) -- this is auth logic, not panel UI, so it lives here once
// instead of being duplicated 4x and risking one copy drifting out of
// sync on a security-sensitive check.
//
// Security Hardening Group 2 (Password Policy Enforcement): the minimum-
// length rule is enforced here, through this one Zod schema, so it can't
// drift between panels the way four independent hand-rolled length checks
// eventually would.
const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "Mevcut şifreni girmelisin."),
    newPassword: passwordSchema,
  })
  .refine((data) => data.newPassword !== data.oldPassword, {
    message: "Yeni şifre mevcut şifreyle aynı olamaz.",
    path: ["newPassword"],
  });

// Supabase Auth has no dedicated "verify the current password" endpoint.
// The standard workaround is to attempt signInWithPassword with the
// CURRENT user's own phone and the claimed old password: success proves
// it's correct, failure means it's wrong. This doesn't touch the active
// session either way -- it's a separate credential check, and the actual
// password change below runs via the session's own already-authenticated
// updateUser() call regardless of how signInWithPassword's result is used.
//
// Routed through the exact same phone-keyed lockout guard as the login
// page (lib/login-lockout.ts) -- this endpoint requires an authenticated
// session already, but a stolen/leaked session let an attacker brute-
// force the real password here with zero risk of ever locking, since it
// used to call signInWithPassword directly. Reusing the same guard closes
// that by construction: five wrong guesses here lock the phone exactly
// as they would from the login page, and count toward the same admin
// unlock queue.
export async function changePasswordWithVerification(oldPassword: string, newPassword: string) {
  const inputV = parseInput(changePasswordSchema, { oldPassword, newPassword });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.phone) throw new Error("Oturum bulunamadı.");

  // Supabase Auth's session returns user.phone WITHOUT the leading "+"
  // (e.g. "905550000004"), while the login page keys its lockout row off
  // normalizeTurkishPhone's "+905550000004" -- routing this through the
  // same guard only actually unifies the two if both key off the exact
  // same normalized string, so this re-normalizes rather than trusting
  // the session's own format.
  const phone = normalizeTurkishPhone(user.phone) ?? user.phone;

  const adminClient = createAdminClient();
  if (await checkLockout(adminClient, phone)) {
    throw new Error(LOCKOUT_MESSAGE);
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    phone: user.phone,
    password: inputV.oldPassword,
  });
  if (verifyError) {
    const justLocked = await recordFailedAttempt(adminClient, phone);
    throw new Error(justLocked ? LOCKOUT_MESSAGE : "Mevcut şifre yanlış.");
  }
  await clearFailedAttempts(adminClient, phone);

  const { error } = await supabase.auth.updateUser({ password: inputV.newPassword });
  if (error) throw dbError(error);
}

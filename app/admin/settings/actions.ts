"use server";

import { changePasswordWithVerification } from "@/lib/change-password";

export async function changePassword(oldPassword: string, newPassword: string) {
  await changePasswordWithVerification(oldPassword, newPassword);
}

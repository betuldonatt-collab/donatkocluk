"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const ROLE_HOME: Record<string, string> = {
  student: "/student",
  parent: "/parent",
  coach: "/coach",
  admin: "/admin",
};

export type AuthFormState = {
  error?: string;
  message?: string;
};

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "student");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "E-posta veya şifre hatalı." };
  }

  redirect(ROLE_HOME[role] ?? "/");
}

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "");
  const role = String(formData.get("role") ?? "student");

  if (!(role in ROLE_HOME)) {
    return { error: "Geçersiz rol." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, full_name: fullName } },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return {
      message: "Hesabın oluşturuldu. E-postanı onayladıktan sonra giriş yapabilirsin.",
    };
  }

  redirect(ROLE_HOME[role] ?? "/");
}
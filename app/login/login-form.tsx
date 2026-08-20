"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { signIn, signUp, type AuthFormState } from "./actions";

const initialState: AuthFormState = {};

export function LoginForm({
  role,
  roleLabel,
}: {
  role: string;
  roleLabel: string;
}) {
  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialState,
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUp,
    initialState,
  );

  return (
    <Tabs defaultValue="signin">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">Giriş Yap</TabsTrigger>
        <TabsTrigger value="signup">Kayıt Ol</TabsTrigger>
      </TabsList>

      <TabsContent value="signin">
        <form action={signInAction} className="space-y-4">
          <input type="hidden" name="role" value={role} />
          <div className="space-y-2">
            <Label htmlFor="signin-email">E-posta</Label>
            <Input id="signin-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signin-password">Şifre</Label>
            <Input
              id="signin-password"
              name="password"
              type="password"
              required
            />
          </div>
          {signInState.error && (
            <p className="text-destructive text-sm">{signInState.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={signInPending}>
            {signInPending ? "Giriş yapılıyor..." : `${roleLabel} olarak giriş yap`}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="signup">
        <form action={signUpAction} className="space-y-4">
          <input type="hidden" name="role" value={role} />
          <div className="space-y-2">
            <Label htmlFor="signup-name">Ad Soyad</Label>
            <Input id="signup-name" name="fullName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">E-posta</Label>
            <Input id="signup-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Şifre</Label>
            <Input
              id="signup-password"
              name="password"
              type="password"
              minLength={6}
              required
            />
          </div>
          {signUpState.error && (
            <p className="text-destructive text-sm">{signUpState.error}</p>
          )}
          {signUpState.message && (
            <p className="text-muted-foreground text-sm">
              {signUpState.message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={signUpPending}>
            {signUpPending
              ? "Kayıt oluşturuluyor..."
              : `${roleLabel} olarak kayıt ol`}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
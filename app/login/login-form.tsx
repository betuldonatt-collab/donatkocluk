"use client";

import { useState } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { signIn, submitPasswordResetRequest, submitSignupRequest, type AuthFormState } from "./actions";

const initialState: AuthFormState = {};

// Requestable via the public signup form -- 'admin' is deliberately absent
// (see REQUESTABLE_ROLES in ./actions.ts; this list must stay in sync).
const SIGNUP_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "student", label: "Öğrenci" },
  { value: "parent", label: "Veli" },
  { value: "coach", label: "Koç" },
];

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
  const [requestState, requestAction, requestPending] = useActionState(
    submitSignupRequest,
    initialState,
  );
  const [forgotState, forgotAction, forgotPending] = useActionState(
    submitPasswordResetRequest,
    initialState,
  );
  // Toggles the signin tab's own content between the login form and the
  // "forgot password" form -- a separate view within the same tab, not a
  // third Tabs entry, since it's a fallback off the login form itself
  // rather than a parallel top-level destination like signup.
  const [showForgot, setShowForgot] = useState(false);

  // The signup form's role used to rely silently on which page/URL the
  // visitor landed on (?role=parent vs ?role=student), with nothing in
  // the form itself confirming that -- a parent who ended up on the
  // student page's "Kayıt İsteği Gönder" tab (the landing page shows
  // "Öğrenci Girişi" first, "Veli Girişi" is one click further) would
  // silently submit a student request with no indication anything was
  // wrong. Defaulting to the current page's role but making it an
  // explicit, visible field here means a mismatch is something the user
  // can actually see and correct before submitting.
  const [signupRole, setSignupRole] = useState(
    SIGNUP_ROLE_OPTIONS.some((o) => o.value === role) ? role : "student",
  );
  // Only meaningful for a student account -- parent/coach requests never
  // send this field at all (see submitSignupRequest, ./actions.ts).
  const [signupExamType, setSignupExamType] = useState("YKS");

  // Admin accounts are never self-service -- no request tab is offered
  // for this role, full stop.
  const canRequestAccount = role !== "admin";

  return (
    <Tabs defaultValue="signin">
      <TabsList className={canRequestAccount ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}>
        <TabsTrigger value="signin">Giriş Yap</TabsTrigger>
        {canRequestAccount && <TabsTrigger value="signup">Kayıt İsteği Gönder</TabsTrigger>}
      </TabsList>

      <TabsContent value="signin">
        {showForgot ? (
          <form action={forgotAction} className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Telefon numaranı gir -- yönetici şifreni sıfırlayıp seni telefonla arayacak.
            </p>
            <div className="space-y-2">
              <Label htmlFor="forgot-phone">Telefon</Label>
              <Input id="forgot-phone" name="phone" type="tel" placeholder="05XX XXX XX XX" required />
            </div>
            {forgotState.error && <p className="text-destructive text-sm">{forgotState.error}</p>}
            {forgotState.message && <p className="text-muted-foreground text-sm">{forgotState.message}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForgot(false)}>
                Geri
              </Button>
              <Button type="submit" className="flex-1" disabled={forgotPending}>
                {forgotPending ? "Gönderiliyor..." : "İsteği Gönder"}
              </Button>
            </div>
          </form>
        ) : (
          <form action={signInAction} className="space-y-4">
            <input type="hidden" name="role" value={role} />
            <div className="space-y-2">
              <Label htmlFor="signin-phone">Telefon</Label>
              <Input id="signin-phone" name="phone" type="tel" placeholder="05XX XXX XX XX" required />
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
            {/* Unchecked by default -- a shared/public computer shouldn't
                stay signed in for 30 days just because someone logged in
                on it once. See lib/remember-me.ts for what checking this
                actually does (a sliding 30-day session, not a fixed one). */}
            <div className="flex items-center gap-2">
              <Checkbox id="signin-remember-me" name="rememberMe" />
              <Label htmlFor="signin-remember-me" className="text-muted-foreground text-sm font-normal">
                Beni Hatırla
              </Label>
            </div>
            <Button type="submit" className="w-full" disabled={signInPending}>
              {signInPending ? "Giriş yapılıyor..." : `${roleLabel} olarak giriş yap`}
            </Button>
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-muted-foreground hover:text-foreground block w-full text-center text-xs underline"
            >
              Şifremi Unuttum
            </button>
          </form>
        )}
      </TabsContent>

      {canRequestAccount && (
        <TabsContent value="signup">
          <form action={requestAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="request-role">Hesap Türü</Label>
              <select
                id="request-role"
                name="role"
                value={signupRole}
                onChange={(e) => setSignupRole(e.target.value)}
                className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-10 md:h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                {SIGNUP_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {signupRole === "student" && (
              <div className="space-y-2">
                <Label htmlFor="request-exam-type">Sınav Türü</Label>
                <select
                  id="request-exam-type"
                  name="examType"
                  value={signupExamType}
                  onChange={(e) => setSignupExamType(e.target.value)}
                  className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-10 md:h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  <option value="YKS">YKS (Lise)</option>
                  <option value="LGS">LGS (8. Sınıf)</option>
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="request-name">Ad Soyad</Label>
              <Input id="request-name" name="fullName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-phone">Telefon</Label>
              <Input id="request-phone" name="phone" type="tel" placeholder="05XX XXX XX XX" required />
            </div>
            <p className="text-muted-foreground text-xs">
              Şifre belirlemene gerek yok -- yönetici isteğini onayladıktan sonra seni telefonla arayıp giriş
              bilgilerini iletecek.
            </p>
            {requestState.error && (
              <p className="text-destructive text-sm">{requestState.error}</p>
            )}
            {requestState.message && (
              <p className="text-muted-foreground text-sm">
                {requestState.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={requestPending}>
              {requestPending ? "Gönderiliyor..." : "Kayıt İsteği Gönder"}
            </Button>
          </form>
        </TabsContent>
      )}
    </Tabs>
  );
}

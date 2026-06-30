export const dynamic = "force-dynamic";

import { LockKeyhole, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { loginAction, signupAction } from "./actions";
import { PasswordField } from "./password-field";

const errorCopy: Record<string, string> = {
  "invalid-credentials": "The username or password did not match an existing account.",
  "missing-fields": "Fill in every signup field before creating the account.",
  "weak-password": "Use at least 8 characters for the password.",
  "password-mismatch": "Password and confirm password need to match.",
  "username-taken": "That username is already in use.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  return <LoginPageInner searchParams={searchParams} />;
}

async function LoginPageInner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? errorCopy[params.error] : undefined;
  const defaultMode = params.mode === "signup" ? "signup" : "login";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-5 py-6 lg:px-8">
      <div className="w-full space-y-5">
        <section className="glass-card relative overflow-hidden rounded-[2rem] p-6 text-white lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.3),_transparent_38%),linear-gradient(135deg,_#155eef_0%,_#0d9488_100%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="pill bg-white/16 text-white">DealDash</div>
              <h1 className="max-w-2xl text-3xl font-semibold leading-tight lg:text-4xl">
                DealDash - Book of Business Pipeline Dashboard
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/82">
                Track funded progress, live balances, active pipeline, follow-ups, and rate scenarios from one secure workspace.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:max-w-xl">
              {[
                { icon: TrendingUp, title: "Funded Progress" },
                { icon: Users, title: "Pipeline + Follow-Ups" },
                { icon: ShieldCheck, title: "Live Shared Workspace" },
                { icon: LockKeyhole, title: "Secure Account Access" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.15rem] border border-white/18 bg-white/10 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    <p className="text-sm font-semibold">{item.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-card rounded-[2rem] p-6 lg:p-8">
          <div className="mb-6 space-y-3">
            <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              {defaultMode === "signup" ? "Create Account" : "Login"}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {defaultMode === "signup" ? "Set up your company workspace" : "Welcome back"}
            </h2>
          </div>
          <div className="mb-5 flex gap-2 rounded-[1rem] bg-white/70 p-1 text-sm">
            <a
              className={`flex-1 rounded-[0.9rem] px-4 py-2 text-center ${
                defaultMode === "login" ? "bg-[var(--accent-strong)] text-white" : "text-[var(--muted)]"
              }`}
              href="/login"
            >
              Login
            </a>
            <a
              className={`flex-1 rounded-[0.9rem] px-4 py-2 text-center ${
                defaultMode === "signup" ? "bg-[var(--accent-strong)] text-white" : "text-[var(--muted)]"
              }`}
              href="/login?mode=signup"
            >
              Create account
            </a>
          </div>
          {error ? (
            <div className="mb-6 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {defaultMode === "signup" ? (
            <form action={signupAction} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First name" name="firstName" />
                <Field label="Last name" name="lastName" />
              </div>
              <Field label="Company" name="companyName" />
              <Field label="Username" name="username" />
              <PasswordField label="Password" name="password" placeholder="Create password" />
              <PasswordField label="Confirm password" name="confirmPassword" placeholder="Repeat password" />
              <button className="primary-button w-full" type="submit">
                Create DealDash workspace
              </button>
            </form>
          ) : (
            <form action={loginAction} className="space-y-5">
              <Field label="Username" name="username" />
              <PasswordField label="Password" name="password" placeholder="Enter password" />
              <button className="primary-button w-full" type="submit">
                Enter DealDash
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  placeholder = "",
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-[var(--muted)]" htmlFor={name}>
        {label}
      </label>
      <input className="field" id={name} name={name} placeholder={placeholder} type={type} />
    </div>
  );
}

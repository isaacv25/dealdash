export const dynamic = "force-dynamic";

import { LockKeyhole, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { loginAction, signupAction } from "./actions";

const errorCopy: Record<string, string> = {
  "invalid-credentials": "The username or password did not match an existing account.",
  "missing-fields": "Fill in every signup field before creating the account.",
  "weak-password": "Use at least 8 characters for the password.",
  "password-mismatch": "Password and confirm password need to match.",
  "username-taken": "That username is already in use.",
};

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string }> }) {
  return <LoginPageInner searchParams={searchParams} />;
}

async function LoginPageInner({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string }> }) {
  const params = await searchParams;
  const error = params.error ? errorCopy[params.error] : undefined;
  const defaultMode = params.mode === "signup" ? "signup" : "login";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 lg:px-10">
      <div className="app-grid w-full">
        <section className="glass-card relative overflow-hidden rounded-[2rem] p-8 text-white lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.34),_transparent_36%),linear-gradient(135deg,_#155eef_0%,_#0d9488_100%)]" />
          <div className="relative space-y-8">
            <div className="pill bg-white/16 text-white">DealDash</div>
            <div className="space-y-4">
              <h1 className="max-w-md text-4xl font-semibold leading-tight">Run funded progress, pipeline, follow-ups, and rate mocks from one secure workspace.</h1>
              <p className="max-w-lg text-sm leading-7 text-white/82">This build now stores deals in a shared database, scopes every record to a company, and keeps financials hidden by default until the signed-in user reveals them.</p>
            </div>
            <div className="grid gap-3">
              {[
                { icon: TrendingUp, title: "Funded progress + balances", body: "Track remaining payback, renewal timing, clawbacks, commission status, and syndication in one place." },
                { icon: Users, title: "Company-owned workspace", body: "Every funded deal, lead, and follow-up belongs to the signed-in company instead of one browser." },
                { icon: ShieldCheck, title: "Hidden financials by default", body: "Sensitive money fields stay concealed until the user intentionally reveals them." },
                { icon: LockKeyhole, title: "Username + password auth", body: "Create the first account to bootstrap the workspace, then log back in normally from any device." },
              ].map((item) => (
                <div key={item.title} className="rounded-[1.25rem] border border-white/18 bg-white/10 p-4">
                  <item.icon className="mb-3 h-5 w-5" />
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-white/76">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-card rounded-[2rem] p-8 lg:p-10">
          <div className="mb-8 space-y-3">
            <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">{defaultMode === "signup" ? "Create Account" : "Login"}</div>
            <h2 className="text-3xl font-semibold tracking-tight">{defaultMode === "signup" ? "Set up your company workspace" : "Welcome back"}</h2>
            <p className="text-sm leading-7 text-[var(--muted)]">The first account imports the bundled legacy book into its company workspace. Later accounts start clean unless you import more CSVs.</p>
          </div>
          <div className="mb-6 flex gap-2 rounded-[1rem] bg-white/70 p-1 text-sm">
            <a className={`flex-1 rounded-[0.9rem] px-4 py-2 text-center ${defaultMode === "login" ? "bg-[var(--accent-strong)] text-white" : "text-[var(--muted)]"}`} href="/login">Login</a>
            <a className={`flex-1 rounded-[0.9rem] px-4 py-2 text-center ${defaultMode === "signup" ? "bg-[var(--accent-strong)] text-white" : "text-[var(--muted)]"}`} href="/login?mode=signup">Create account</a>
          </div>
          {error ? <div className="mb-6 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {defaultMode === "signup" ? (
            <form action={signupAction} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First name" name="firstName" placeholder="Ethan" />
                <Field label="Last name" name="lastName" placeholder="Fishman" />
              </div>
              <Field label="Company" name="companyName" placeholder="LetsBuild" />
              <Field label="Username" name="username" placeholder="ethan" />
              <Field label="Password" name="password" placeholder="Create password" type="password" />
              <Field label="Confirm password" name="confirmPassword" placeholder="Repeat password" type="password" />
              <button className="primary-button w-full" type="submit">Create DealDash workspace</button>
            </form>
          ) : (
            <form action={loginAction} className="space-y-5">
              <Field label="Username" name="username" placeholder="ethan" />
              <Field label="Password" name="password" placeholder="Enter password" type="password" />
              <button className="primary-button w-full" type="submit">Enter DealDash</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, name, placeholder, type = "text" }: { label: string; name: string; placeholder: string; type?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-[var(--muted)]" htmlFor={name}>{label}</label>
      <input className="field" id={name} name={name} type={type} placeholder={placeholder} />
    </div>
  );
}

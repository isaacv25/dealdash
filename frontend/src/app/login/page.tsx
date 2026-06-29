import { LockKeyhole, Sparkles, TrendingUp } from "lucide-react";
import { loginAction } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <LoginPageInner searchParams={searchParams} />;
}

async function LoginPageInner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const hasError = (await searchParams).error === "1";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 lg:px-10">
      <div className="app-grid w-full">
        <section className="glass-card relative overflow-hidden rounded-[2rem] p-8 text-white lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.34),_transparent_36%),linear-gradient(135deg,_#155eef_0%,_#0d9488_100%)]" />
          <div className="relative space-y-8">
            <div className="pill bg-white/16 text-white">Dealdash</div>
            <div className="space-y-4">
              <h1 className="max-w-md text-4xl font-semibold leading-tight">
                Run funded deals, pipeline, follow-ups, and rate mocks from one cockpit.
              </h1>
              <p className="max-w-lg text-sm leading-7 text-white/82">
                This build is shaped around your current sheets and designed to let the live numbers
                move together when the deal terms change.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                { icon: TrendingUp, title: "Funded deal progress", body: "Track payback, balance remaining, clawback, syndication, and renewal timing." },
                { icon: Sparkles, title: "Pipeline + follow-up rhythm", body: "Keep applications moving while seeing the context behind each lead." },
                { icon: LockKeyhole, title: "Single-admin access", body: "Set `ADMIN_PASSWORD` and `SESSION_SECRET` for a clean private login." },
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
            <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">Admin Login</div>
            <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm leading-7 text-[var(--muted)]">
              Use the admin password from your environment variables. The default fallback is
              `change-me`, so swap that before going live.
            </p>
          </div>

          <form action={loginAction} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="password">
                Password
              </label>
              <input className="field" id="password" name="password" type="password" placeholder="Enter admin password" />
            </div>

            {hasError ? (
              <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                The password did not match. Check `ADMIN_PASSWORD` and try again.
              </div>
            ) : null}

            <button className="primary-button w-full" type="submit">
              Enter Dealdash
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

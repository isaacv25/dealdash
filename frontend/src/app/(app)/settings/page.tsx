import { getCurrentUser } from "@/lib/auth";
import { updatePasswordAction, updateProfileAction } from "./actions";

const messages: Record<string, string> = {
  saved: "Settings saved.",
  "password-saved": "Password updated.",
  "profile-required": "Fill in name, username, and company name.",
  "username-unavailable": "That username is unavailable.",
  "password-required": "Fill in all password fields.",
  "weak-password": "New password must be at least 8 characters.",
  "password-mismatch": "New password and confirmation do not match.",
  "current-password": "Current password could not be verified.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  const status = params.status;
  const messageKey = params.message || status || "";
  const message = messages[messageKey];

  return (
    <section className="glass-card rounded-[1.6rem] p-5 lg:p-6">
      <div className="mb-5">
        <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">Settings</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Account and workspace</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Keep your login identity and company workspace details current.
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-[1rem] border px-4 py-3 text-sm font-semibold ${
            status === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <form action={updateProfileAction} className="rounded-[1.2rem] border border-[var(--line)] bg-white/78 p-4">
          <h3 className="text-base font-semibold">Profile</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-[var(--muted)]">
              First name
              <input className="field" defaultValue={user.firstName} name="firstName" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-[var(--muted)]">
              Last name
              <input className="field" defaultValue={user.lastName} name="lastName" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-[var(--muted)]">
              Username
              <input className="field" defaultValue={user.username} name="username" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-[var(--muted)]">
              Company name
              <input className="field" defaultValue={user.company.name} name="companyName" />
            </label>
          </div>
          <button className="primary-button mt-4 text-sm" type="submit">
            Save Profile
          </button>
        </form>

        <form action={updatePasswordAction} className="rounded-[1.2rem] border border-[var(--line)] bg-white/78 p-4">
          <h3 className="text-base font-semibold">Password</h3>
          <div className="mt-4 grid gap-3">
            <label className="space-y-1.5 text-sm font-semibold text-[var(--muted)]">
              Current password
              <input className="field" name="currentPassword" type="password" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-[var(--muted)]">
              New password
              <input className="field" name="nextPassword" type="password" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-[var(--muted)]">
              Confirm new password
              <input className="field" name="confirmPassword" type="password" />
            </label>
          </div>
          <button className="primary-button mt-4 text-sm" type="submit">
            Update Password
          </button>
        </form>
      </div>
    </section>
  );
}

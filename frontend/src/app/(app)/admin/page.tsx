import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

const userDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function AdminPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
      company: { select: { name: true } },
      sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  return (
    <section className="glass-card rounded-[1.6rem] p-5 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">Admin</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">User access</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Account visibility for Ethan only. Sensitive auth material is intentionally excluded.
          </p>
        </div>
        <div className="rounded-[1rem] border border-[var(--line)] bg-white/78 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Total users</p>
          <p className="text-2xl font-semibold">{users.length}</p>
        </div>
      </div>

      <div className="table-wrap border border-white/80 bg-white/76">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-white/88 text-left text-[var(--muted)]">
            <tr>
              {["Name", "Username", "Email", "Company", "Role", "Created", "Last Login"].map((heading) => (
                <th key={heading} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-3 font-semibold">{user.firstName} {user.lastName}</td>
                <td className="px-3 py-3">{user.username}</td>
                <td className="px-3 py-3 text-[var(--muted)]">Not collected</td>
                <td className="px-3 py-3">{user.company.name}</td>
                <td className="px-3 py-3">
                  <span className="pill bg-white text-[var(--foreground)]">{user.role}</span>
                </td>
                <td className="px-3 py-3 text-[var(--muted)]">{userDateFormatter.format(user.createdAt)}</td>
                <td className="px-3 py-3 text-[var(--muted)]">
                  {user.sessions[0] ? userDateFormatter.format(user.sessions[0].createdAt) : "No session"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

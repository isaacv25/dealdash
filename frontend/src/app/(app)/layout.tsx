export const dynamic = "force-dynamic";

import { AppShell } from "@/components/dealdash/app-shell";
import { DealdashProvider } from "@/components/dealdash/state";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { loadWorkspaceForUser } from "@/lib/dealdash/workspace";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAuth();
  const user = await getCurrentUser();
  if (!user) throw new Error("Unable to resolve the authenticated user.");
  const snapshot = await loadWorkspaceForUser(user.id);

  return (
    <DealdashProvider initialData={snapshot.data} viewer={snapshot.viewer}>
      <AppShell>{children}</AppShell>
    </DealdashProvider>
  );
}

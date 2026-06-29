import { AppShell } from "@/components/dealdash/app-shell";
import { DealdashProvider } from "@/components/dealdash/state";
import { requireAuth } from "@/lib/auth";
import { loadInitialSeed } from "@/lib/seed";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAuth();
  const initialData = await loadInitialSeed();

  return (
    <DealdashProvider initialData={initialData}>
      <AppShell>{children}</AppShell>
    </DealdashProvider>
  );
}

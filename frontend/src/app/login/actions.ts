"use server";

import { redirect } from "next/navigation";
import { clearSession, createSession, verifyAdminPassword } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") || "");
  if (!(await verifyAdminPassword(password))) {
    redirect("/login?error=1");
  }

  await createSession();
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

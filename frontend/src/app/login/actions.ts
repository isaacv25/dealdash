"use server";

import { redirect } from "next/navigation";
import { clearSession, createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { seedFirstCompanyWorkspace } from "@/lib/dealdash/workspace";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

/**
 * Signup creates the first tenant-aware account model for DealDash.
 * The very first account also receives the bundled legacy spreadsheet dataset so Ethan's live book
 * is preserved without leaking that seed into later companies.
 */
export async function signupAction(formData: FormData) {
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const companyName = String(formData.get("companyName") || "").trim();
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!firstName || !lastName || !companyName || !username || !password) redirect("/login?mode=signup&error=missing-fields");
  if (password.length < 8) redirect("/login?mode=signup&error=weak-password");
  if (password !== confirmPassword) redirect("/login?mode=signup&error=password-mismatch");
  if (await prisma.user.findUnique({ where: { username } })) redirect("/login?mode=signup&error=username-taken");

  const firstAccount = (await prisma.user.count()) === 0;
  const baseSlug = slugify(companyName);
  const existingCompany = await prisma.company.findUnique({ where: { slug: baseSlug } });
  const company = await prisma.company.create({
    data: { name: companyName, slug: existingCompany ? `${baseSlug}-${Date.now()}` : baseSlug },
  });

  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      firstName,
      lastName,
      username,
      passwordHash: hashPassword(password),
      hideFinancialsByDefault: true,
    },
  });

  if (firstAccount) await seedFirstCompanyWorkspace(company.id, user.id);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash)) redirect("/login?error=invalid-credentials");
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

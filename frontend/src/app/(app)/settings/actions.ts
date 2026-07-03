"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

function settingsRedirect(status: "saved" | "password-saved" | "error", message?: string) {
  const params = new URLSearchParams({ status });
  if (message) params.set("message", message);
  redirect(`/settings?${params.toString()}`);
}

async function requireSettingsUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireSettingsUser();
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const companyName = String(formData.get("companyName") || "").trim();

  if (!firstName || !lastName || !username || !companyName) {
    settingsRedirect("error", "profile-required");
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser && existingUser.id !== user.id) {
    // Keep this intentionally generic so the app never confirms who owns a taken username.
    settingsRedirect("error", "username-unavailable");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { firstName, lastName, username },
    }),
    prisma.company.update({
      where: { id: user.companyId },
      data: { name: companyName },
    }),
  ]);

  settingsRedirect("saved");
}

export async function updatePasswordAction(formData: FormData) {
  const user = await requireSettingsUser();
  const currentPassword = String(formData.get("currentPassword") || "");
  const nextPassword = String(formData.get("nextPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!currentPassword || !nextPassword || !confirmPassword) {
    settingsRedirect("error", "password-required");
  }
  if (nextPassword.length < 8) {
    settingsRedirect("error", "weak-password");
  }
  if (nextPassword !== confirmPassword) {
    settingsRedirect("error", "password-mismatch");
  }

  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!freshUser || !verifyPassword(currentPassword, freshUser.passwordHash)) {
    settingsRedirect("error", "current-password");
  }

  // Password updates stay on the existing scrypt path so signup and settings hashes match.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(nextPassword) },
  });

  settingsRedirect("password-saved");
}

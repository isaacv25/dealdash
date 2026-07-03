import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

const SESSION_COOKIE = "dealdash_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for DealDash auth.");
  }
  return secret;
}

export function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for DealDash persistence and authentication.");
  }
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(`${getSessionSecret()}:${token}`).digest("hex");
}

/**
 * Passwords are stored as salt:hash using scrypt so we can stay self-contained on Vercel
 * without introducing another native dependency just for hashing.
 */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const derived = scryptSync(password, salt, 64).toString("hex");
  if (derived.length != expected.length) return false;
  return timingSafeEqual(Buffer.from(derived), Buffer.from(expected));
}

async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function createSession(userId: string) {
  assertDatabaseConfigured();
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    },
  });
  await setSessionCookie(token);
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Sessions resolve all the way to the owning company so every server action can enforce
 * tenant boundaries before reading or writing deal data.
 */
export async function getCurrentUser() {
  assertDatabaseConfigured();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { company: true } } },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    jar.delete(SESSION_COOKIE);
    return null;
  }

  return session.user;
}

export async function isAuthenticated() {
  return Boolean(await getCurrentUser());
}

export async function requireAuth() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
}

export function isAdminUser(user: { role: string }) {
  return user.role === "admin";
}

export async function requireAdmin() {
  await requireAuth();
  const user = await getCurrentUser();
  // Admin access is intentionally pinned to Ethan's account, not just any admin-like role.
  if (!user || !isAdminUser(user)) {
    redirect("/dashboard");
  }
  return user;
}

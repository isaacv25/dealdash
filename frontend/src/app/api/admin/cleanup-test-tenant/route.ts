import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * One-time operator utility: deletes a specific test company (by slug) created during live
 * verification of the Funded Progress rework, and reports every remaining Company/User so the
 * operator can confirm production tenants are untouched. Protected by the same CRON_SECRET as the
 * payment poster since it is a trusted secret already shared only between the operator and Vercel.
 * Intended to be removed again once used -- see git history for this file's lifetime.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug : null;

  let deleted: { id: string; name: string; slug: string } | null = null;
  if (slug) {
    const company = await prisma.company.findUnique({ where: { slug } });
    if (company) {
      await prisma.company.delete({ where: { id: company.id } });
      deleted = { id: company.id, name: company.name, slug: company.slug };
    }
  }

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      users: { select: { id: true, username: true, role: true, firstName: true, lastName: true, createdAt: true } },
    },
  });

  return NextResponse.json({ deleted, companies });
}

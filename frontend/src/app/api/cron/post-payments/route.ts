import { NextRequest, NextResponse } from "next/server";
import { postDuePayments } from "@/lib/dealdash/schedule-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Posts every scheduled payment that is due (or overdue) in America/New_York. Vercel Cron invokes
 * this hourly with an Authorization: Bearer <CRON_SECRET> header it adds automatically when
 * CRON_SECRET is set on the project; see vercel.json for the schedule. Because "due" means "on or
 * before today" rather than "exactly today", a missed hour (deploy in progress, transient outage)
 * is simply caught up on the next successful run -- no separate backfill job is needed.
 */
async function handlePost(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await postDuePayments(new Date(), "vercel-cron");
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error." }, { status: 500 });
  }
}

// Vercel Cron sends GET by default; a POST handler is kept identical so the same endpoint can be
// triggered manually (e.g. from an admin action) with the same auth check.
export async function GET(request: NextRequest) {
  return handlePost(request);
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}

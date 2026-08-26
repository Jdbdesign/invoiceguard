import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity } from "@/lib/mappers";

export async function GET() {
  const entries = await prisma.activityLog.findMany({
    include: { invoice: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(entries.map(mapActivity));
}

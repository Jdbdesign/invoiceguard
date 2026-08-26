import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity } from "@/lib/mappers";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.activityLog.findMany({
    where: { client: { ownerId: session.user.id } },
    include: { invoice: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(entries.map(mapActivity));
}

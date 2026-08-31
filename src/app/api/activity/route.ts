import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity } from "@/lib/mappers";
import { parsePaginationParams } from "@/lib/pagination";
import { auth } from "@/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pagination = parsePaginationParams(searchParams);
  const clientId = searchParams.get("clientId");
  const where = {
    client: { ownerId: session.user.id },
    ...(clientId ? { clientId } : {}),
  };

  if (!pagination) {
    const entries = await prisma.activityLog.findMany({
      where,
      include: { invoice: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(entries.map(mapActivity));
  }

  const [total, entries] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      include: { invoice: true },
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
  ]);

  return NextResponse.json({
    data: entries.map(mapActivity),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity } from "@/lib/mappers";
import { parsePaginationParams } from "@/lib/pagination";
import { resolveShareLink } from "@/lib/shareLink";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = await resolveShareLink(token);
  if (!link) {
    return NextResponse.json(
      { error: "This link is no longer available" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const pagination = parsePaginationParams(searchParams) ?? { page: 1, pageSize: 25 };
  const where = { clientId: link.clientId };

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

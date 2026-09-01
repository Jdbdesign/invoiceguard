import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { createShareLink } from "@/lib/shareLink";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const client = await prisma.client.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const links = await prisma.shareLink.findMany({
    where: {
      clientId: id,
      ownerId: session.user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    links.map((link) => ({
      id: link.id,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt.toISOString(),
      lastAccessedAt: link.lastAccessedAt?.toISOString() ?? null,
    }))
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const client = await prisma.client.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const { id: linkId, rawToken, expiresAt } = await createShareLink(session.user.id, id);

  const baseUrl =
    process.env.APP_BASE_URL ??
    (process.env.NODE_ENV === "production" ? null : "http://localhost:3000");
  if (!baseUrl) {
    console.error("APP_BASE_URL is not set — cannot build a share link");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  return NextResponse.json({
    id: linkId,
    url: `${baseUrl}/share/${rawToken}`,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastAccessedAt: null,
  });
}

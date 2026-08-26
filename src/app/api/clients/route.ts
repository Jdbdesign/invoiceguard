import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient } from "@/lib/mappers";

export async function GET() {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(clients.map(mapClient));
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  if (!name || !email) {
    return NextResponse.json(
      { error: "name and email are required" },
      { status: 400 }
    );
  }

  const client = await prisma.client.create({ data: { name, email, phone } });
  return NextResponse.json(mapClient(client), { status: 201 });
}

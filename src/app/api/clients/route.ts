import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient } from "@/lib/mappers";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/utils";
import { auth } from "@/auth";

const VALID_CURRENCIES = new Set(CURRENCIES.map((c) => c.code));

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clients = await prisma.client.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(clients.map(mapClient));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const currencyInput = String(body.currency ?? "").trim().toUpperCase();
  const currency = VALID_CURRENCIES.has(currencyInput) ? currencyInput : DEFAULT_CURRENCY;

  if (!name || !email) {
    return NextResponse.json(
      { error: "name and email are required" },
      { status: 400 }
    );
  }

  const client = await prisma.client.create({
    data: { name, email, phone, currency, ownerId: session.user.id },
  });
  return NextResponse.json(mapClient(client), { status: 201 });
}

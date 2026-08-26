import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient } from "@/lib/mappers";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/utils";

const VALID_CURRENCIES = new Set(CURRENCIES.map((c) => c.code));

export async function GET() {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(clients.map(mapClient));
}

export async function POST(request: Request) {
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

  const client = await prisma.client.create({ data: { name, email, phone, currency } });
  return NextResponse.json(mapClient(client), { status: 201 });
}

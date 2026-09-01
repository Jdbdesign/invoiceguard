import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient } from "@/lib/mappers";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/utils";
import { parsePaginationParams } from "@/lib/pagination";
import { getClientListItems } from "@/lib/clientListQuery";
import { auth } from "@/auth";

const VALID_CURRENCIES = new Set(CURRENCIES.map((c) => c.code));

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = session.user.id;
  const { searchParams } = new URL(request.url);
  const pagination = parsePaginationParams(searchParams);

  if (!pagination) {
    const clients = await prisma.client.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clients.map(mapClient));
  }

  const items = await getClientListItems(ownerId);
  const total = items.length;
  const start = (pagination.page - 1) * pagination.pageSize;
  const data = items.slice(start, start + pagination.pageSize);

  return NextResponse.json({ data, total, page: pagination.page, pageSize: pagination.pageSize });
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

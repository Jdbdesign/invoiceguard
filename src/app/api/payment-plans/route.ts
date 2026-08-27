import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapPaymentPlan } from "@/lib/mappers";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plans = await prisma.paymentPlan.findMany({
    where: { invoice: { client: { ownerId: session.user.id } } },
    include: { invoice: true, installments: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(plans.map(mapPaymentPlan));
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapPaymentPlan } from "@/lib/mappers";

export async function GET() {
  const plans = await prisma.paymentPlan.findMany({
    include: { invoice: true, installments: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(plans.map(mapPaymentPlan));
}

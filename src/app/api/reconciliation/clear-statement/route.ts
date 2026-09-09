import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

interface ClearStatementBody {
  uploadId?: unknown;
}

// Clears one statement's worth of BankTransaction rows, scoped strictly by
// uploadId — never touches another statement's data. Two-step, inside one
// $transaction so it's all-or-nothing:
//
// 1. Unlink any confirmed Payment matched to one of this statement's
//    transactions — same { reconciledAt: null, bankTransactionId: null }
//    update the single-item "Undo" action performs (matches/[paymentId]/
//    route.ts). This is what keeps step 2 safe: Payment.bankTransactionId's
//    FK is ON DELETE SET NULL, so deleting a still-linked BankTransaction
//    would silently null it out while leaving reconciledAt set — a Payment
//    stuck invisible in every bucket (not in Matched, since bankTransactionId
//    is now null; not in Unmatched — Ours, since reconciledAt isn't). Explicitly
//    unlinking first avoids that and returns the Payment to Unmatched — Ours,
//    same as a manual Undo would.
// 2. Delete every BankTransaction row left for this uploadId — by then every
//    transaction that had a Payment no longer does, so `payment: null` (the
//    same filter Unmatched — Bank and Needs Review read against) covers all
//    of them, alongside whatever was already unmatched/ignored.
//
// Unlinking doesn't revert any invoice status change a match may have caused
// (e.g. linkInvoiceDirect marking an invoice "paid") — same as the existing
// single-item Undo action; Clear Statement isn't introducing new behavior
// there, just applying it in bulk.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;
  const ownerId = session.user.id;

  const body = (await request.json().catch(() => ({}))) as ClearStatementBody;
  if (typeof body.uploadId !== "string") {
    return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
  }
  const { uploadId } = body;

  const upload = await prisma.bankStatementUpload.findFirst({ where: { id: uploadId, ownerId } });
  if (!upload) return NextResponse.json({ error: "statement not found" }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    const matchedPayments = await tx.payment.findMany({
      where: { bankTransactionId: { not: null }, bankTransaction: { uploadId, ownerId } },
      select: { id: true },
    });

    if (matchedPayments.length > 0) {
      await tx.payment.updateMany({
        where: { id: { in: matchedPayments.map((p) => p.id) } },
        data: { reconciledAt: null, bankTransactionId: null },
      });
    }

    const { count: deletedTransactionCount } = await tx.bankTransaction.deleteMany({
      where: { ownerId, uploadId, payment: null },
    });

    return { unlinkedPaymentCount: matchedPayments.length, deletedTransactionCount };
  });

  return NextResponse.json(result);
}

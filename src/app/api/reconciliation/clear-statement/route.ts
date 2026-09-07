import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

// Deletes every currently-unmatched BankTransaction row for this owner —
// i.e. everything that isn't already linked to a Payment (Matched bucket is
// never touched; BankTransaction.payment relation is the same "payment:
// null" filter the Unmatched — Bank bucket itself uses). Ignored transactions
// are included since they're not reconciled either. BankStatementUpload rows
// (Recent Uploads) are untouched — this only ever deletes BankTransaction
// children, and the FK from BankTransaction to BankStatementUpload is
// ON DELETE RESTRICT in the other direction, so there's no risk of this
// cascading into the upload log.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const { count } = await prisma.bankTransaction.deleteMany({
    where: { ownerId: session.user.id, payment: null },
  });

  return NextResponse.json({ deletedCount: count });
}

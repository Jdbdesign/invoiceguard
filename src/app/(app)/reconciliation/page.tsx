import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankStatementUpload } from "@/lib/mappers";
import { ReconciliationWorkspace } from "./ReconciliationWorkspace";

export default async function ReconciliationPage() {
  const session = await auth();
  const uploads = session?.user
    ? (
        await prisma.bankStatementUpload.findMany({
          where: { ownerId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      ).map(mapBankStatementUpload)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Reconciliation
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Match bank transactions against recorded payments — upload a statement to get
          started.
        </p>
      </div>
      <ReconciliationWorkspace uploads={uploads} />
    </div>
  );
}

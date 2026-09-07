import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankStatementUpload } from "@/lib/mappers";
import { UploadStatementButton } from "./UploadStatementButton";
import { UploadsList } from "./UploadsList";
import { MatchBuckets } from "./MatchBuckets";

export default async function ReconciliationPage() {
  const session = await auth();
  const uploads = session?.user
    ? (
        await prisma.bankStatementUpload.findMany({
          where: { ownerId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      ).map(mapBankStatementUpload)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reconciliation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Match bank transactions against recorded payments — upload a statement to get
            started.
          </p>
        </div>
        <UploadStatementButton />
      </div>
      <UploadsList uploads={uploads} />
      <MatchBuckets />
    </div>
  );
}

import { UploadStatementButton } from "./UploadStatementButton";
import { MatchBuckets } from "./MatchBuckets";

export default function ReconciliationPage() {
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
      <MatchBuckets />
    </div>
  );
}

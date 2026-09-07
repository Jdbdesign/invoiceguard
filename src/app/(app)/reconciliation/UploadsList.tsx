import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { bankStatementUploadStatusLabel } from "@/lib/badgeHelpers";
import { formatDateTime } from "@/lib/utils";
import type { BankStatementUpload } from "@/lib/types";

export function UploadsList({ uploads }: { uploads: BankStatementUpload[] }) {
  return (
    <Card>
      <CardHeader
        title="Recent uploads"
        subtitle="Statements you've uploaded, and any that still need review."
      />
      {uploads.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No statements uploaded yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {uploads.map((upload) => {
            const { label, variant } = bankStatementUploadStatusLabel(upload.status);
            return (
              <li
                key={upload.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
              >
                <div>
                  <p className="text-slate-700">
                    {upload.fileName} — {formatDateTime(upload.createdAt)}
                  </p>
                  {upload.status === "failed" && upload.errorMessage && (
                    <p className="mt-1 text-xs text-rose-500">{upload.errorMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={variant}>{label}</Badge>
                  {upload.status === "needs_review" && (
                    <Link
                      href={`/reconciliation/${upload.id}/review`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Review
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

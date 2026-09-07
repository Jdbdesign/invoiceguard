import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ReviewRowsEditor } from "./ReviewRowsEditor";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ uploadId: string }>;
}) {
  const { uploadId } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  const upload = await prisma.bankStatementUpload.findFirst({
    where: { id: uploadId, ownerId: session.user.id },
  });
  if (!upload) notFound();

  const initialRows = Array.isArray(upload.parsedRowsJson)
    ? (upload.parsedRowsJson as { date: string; description: string; amount: number }[])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Review parsed transactions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {upload.fileName} — fix any misread rows before matching runs.
        </p>
      </div>

      <ReviewRowsEditor uploadId={upload.id} initialRows={initialRows} />
    </div>
  );
}

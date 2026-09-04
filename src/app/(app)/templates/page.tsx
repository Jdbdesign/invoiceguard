import { render } from "react-email";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { RECEIPT_TEMPLATES } from "@/lib/receiptTemplates";

export default async function TemplatesPage() {
  const templates = await Promise.all(
    RECEIPT_TEMPLATES.map(async (template) => ({
      template,
      html: await render(template.Component(template.sampleProps)),
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Templates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          The receipt email clients receive automatically when an invoice is paid in full.
        </p>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        This is exactly what a client receives — invoice number, amount, and date are merged
        into this fixed design, never AI-generated. Sample data shown below.
      </p>

      <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map(({ template, html }) => (
          <TemplateCard
            key={template.id}
            id={template.id}
            name={template.name}
            description={template.description}
            html={html}
          />
        ))}
      </div>
    </div>
  );
}

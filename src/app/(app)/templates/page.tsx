import { render } from "react-email";
import { Card, CardHeader } from "@/components/ui/Card";
import { TemplatePreviewFrame } from "@/components/templates/TemplatePreviewFrame";
import { RECEIPT_TEMPLATES, getActiveReceiptTemplate } from "@/lib/receiptTemplates";

export default async function TemplatesPage() {
  const activeTemplate = getActiveReceiptTemplate();

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

      {templates.map(({ template, html }) => (
        <Card key={template.id}>
          <CardHeader
            title={template.name}
            subtitle={
              template.id === activeTemplate.id
                ? `${template.description} · Currently in use`
                : template.description
            }
          />
          <div className="px-5 py-5">
            <TemplatePreviewFrame html={html} />
          </div>
        </Card>
      ))}
    </div>
  );
}

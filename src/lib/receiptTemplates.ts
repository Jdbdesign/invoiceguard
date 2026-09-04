import {
  PaymentReceiptEmail,
  type PaymentReceiptEmailProps,
} from "@/emails/PaymentReceiptEmail";
import { PaymentReceiptIndigoEmail } from "@/emails/PaymentReceiptIndigoEmail";

export interface ReceiptTemplate {
  id: string;
  name: string;
  description: string;
  Component: (props: PaymentReceiptEmailProps) => React.JSX.Element;
  sampleProps: PaymentReceiptEmailProps;
}

// Every call site (the Templates page, the sender below) goes through this
// registry rather than importing an email component directly, so adding a
// new design is a one-entry addition here plus a new file under src/emails.
export const RECEIPT_TEMPLATES: ReceiptTemplate[] = [
  {
    id: "default",
    name: "Default receipt",
    description: "Emerald \"paid\" banner with an itemized summary.",
    Component: PaymentReceiptEmail,
    sampleProps: PaymentReceiptEmail.PreviewProps,
  },
  {
    id: "indigo",
    name: "Indigo receipt",
    description: "Structured indigo document layout with a boxed total.",
    Component: PaymentReceiptIndigoEmail,
    sampleProps: PaymentReceiptIndigoEmail.PreviewProps,
  },
];

// The template used for a given account's receipts. Reading from the
// registry (rather than hardcoding a component) means switching the active
// design doesn't require touching sender code. Falls back to the first
// entry if the stored id doesn't match anything currently registered.
export function getActiveReceiptTemplate(activeTemplateId?: string): ReceiptTemplate {
  const match = RECEIPT_TEMPLATES.find((template) => template.id === activeTemplateId);
  return match ?? RECEIPT_TEMPLATES[0];
}

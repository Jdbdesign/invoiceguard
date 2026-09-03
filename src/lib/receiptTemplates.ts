import {
  PaymentReceiptEmail,
  type PaymentReceiptEmailProps,
} from "@/emails/PaymentReceiptEmail";

export interface ReceiptTemplate {
  id: string;
  name: string;
  description: string;
  Component: (props: PaymentReceiptEmailProps) => React.JSX.Element;
  sampleProps: PaymentReceiptEmailProps;
}

// Only one entry today, but every call site (the Templates page, the sender
// below) goes through this registry rather than importing PaymentReceiptEmail
// directly, so adding a second design later is a one-line addition here.
export const RECEIPT_TEMPLATES: ReceiptTemplate[] = [
  {
    id: "default",
    name: "Default receipt",
    description: "Emerald \"paid\" banner with an itemized summary.",
    Component: PaymentReceiptEmail,
    sampleProps: PaymentReceiptEmail.PreviewProps,
  },
];

// The template used for every receipt sent today. Reading from the registry
// (rather than hardcoding PaymentReceiptEmail) means switching the active
// design later doesn't require touching sender code.
export function getActiveReceiptTemplate(): ReceiptTemplate {
  return RECEIPT_TEMPLATES[0];
}

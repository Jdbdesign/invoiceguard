import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

interface ReminderEmailProps {
  invoiceNumber: string;
  amountDue: string;
  body: string;
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default function ReminderEmail({
  invoiceNumber,
  amountDue,
  body,
}: ReminderEmailProps) {
  const paragraphs = splitParagraphs(body);

  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />
        <Preview>
          Invoice {invoiceNumber} — {amountDue} due
        </Preview>
        <Body
          className="m-0 bg-slate-50 p-0"
          style={{ fontFamily: FONT_STACK }}
        >
          <Container className="mx-auto w-full max-w-[600px] px-4 py-10">
            <Section className="pb-6">
              <Text className="m-0 text-[15px] font-semibold tracking-tight text-slate-900">
                InvoiceGuard
              </Text>
            </Section>

            <Section className="rounded-xl border border-solid border-slate-200 bg-white px-8 py-9">
              <Text className="m-0 mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                Invoice {invoiceNumber}
              </Text>
              <Text className="m-0 mb-6 text-2xl font-semibold text-slate-900">
                {amountDue} due
              </Text>

              <Hr className="mb-6 border-solid border-slate-200" />

              {paragraphs.map((paragraph, index) => (
                <Text
                  key={index}
                  className="m-0 mb-4 text-[15px] leading-6 text-slate-900 whitespace-pre-line"
                >
                  {paragraph}
                </Text>
              ))}
            </Section>

            <Section className="pt-6 text-center">
              <Text className="m-0 mb-1 text-xs text-slate-400">
                This is an automated payment reminder from InvoiceGuard.
              </Text>
              <Text className="m-0 text-xs text-slate-400">
                © {new Date().getFullYear()} InvoiceGuard
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

ReminderEmail.PreviewProps = {
  invoiceNumber: "INV-1042",
  amountDue: "$1,240.00",
  body: `Hi Jordan,

Hope you're doing well. This is a friendly reminder that invoice INV-1042 for $1,240.00 was due on March 3rd and remains unpaid.

If you've already sent payment, please disregard this note. Otherwise, you can settle the balance at your earliest convenience, or reach out if you'd like to discuss a payment plan.

Thanks for your business — let us know if there's anything we can help with.

The InvoiceGuard team`,
} satisfies ReminderEmailProps;

export { ReminderEmail };

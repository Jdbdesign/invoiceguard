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

interface ReminderLineItem {
  description: string;
  amount: string;
}

interface ReminderEmailProps {
  invoiceNumber: string;
  description: string;
  amountDue: string;
  dueDate: string;
  body: string;
  items?: ReminderLineItem[];
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

const DETAILS_MARKER = /^here are the details for your reference:?$/i;

function splitAtDetailsMarker(paragraphs: string[]): {
  before: string[];
  after: string[];
} {
  const markerIndex = paragraphs.findIndex((paragraph) =>
    DETAILS_MARKER.test(paragraph)
  );
  // Fall back to right after the opening paragraph if the AI-drafted body
  // ever omits the exact marker line, so the invoice details never get lost.
  const insertAfter = markerIndex !== -1 ? markerIndex : 0;
  return {
    before: paragraphs.slice(0, insertAfter + 1),
    after: paragraphs.slice(insertAfter + 1),
  };
}

export default function ReminderEmail({
  invoiceNumber,
  description,
  amountDue,
  dueDate,
  body,
  items,
}: ReminderEmailProps) {
  const hasItems = Boolean(items && items.length > 0);
  const paragraphs = splitParagraphs(body);
  const { before, after } = splitAtDetailsMarker(paragraphs);

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
                Remitrak
              </Text>
            </Section>

            <Section className="rounded-xl border border-solid border-slate-200 bg-white px-8 py-9">
              {before.map((paragraph, index) => (
                <Text
                  key={`before-${index}`}
                  className="m-0 mb-4 text-[15px] leading-6 text-slate-900 whitespace-pre-line"
                >
                  {paragraph}
                </Text>
              ))}

              <Hr className="mb-6 border-solid border-slate-200" />

              <Text className="m-0 mb-2 text-[15px] leading-6 text-slate-900">
                <strong>Invoice:</strong> {invoiceNumber}
              </Text>
              {hasItems ? (
                <div style={{ marginBottom: 8 }}>
                  <Text className="m-0 mb-1 text-[15px] leading-6 text-slate-900">
                    <strong>Items:</strong>
                  </Text>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {items!.map((item, index) => (
                      <li key={index} style={{ fontSize: 15, lineHeight: "24px", color: "#0f172a" }}>
                        {item.description} — {item.amount}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Text className="m-0 mb-2 text-[15px] leading-6 text-slate-900">
                  <strong>Description:</strong> {description}
                </Text>
              )}
              <Text className="m-0 mb-2 text-[15px] leading-6 text-slate-900">
                <strong>Amount due:</strong> {amountDue}
              </Text>
              <Text className="m-0 mb-6 text-[15px] leading-6 text-slate-900">
                <strong>Due date:</strong> {dueDate}
              </Text>

              <Hr className="mb-6 border-solid border-slate-200" />

              {after.map((paragraph, index) => (
                <Text
                  key={`after-${index}`}
                  className="m-0 mb-4 text-[15px] leading-6 text-slate-900 whitespace-pre-line"
                >
                  {paragraph}
                </Text>
              ))}
            </Section>

            <Section className="pt-6 text-center">
              <Text className="m-0 mb-1 text-xs text-slate-400">
                This is an automated payment reminder from Remitrak.
              </Text>
              <Text className="m-0 text-xs text-slate-400">
                © {new Date().getFullYear()} Remitrak
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
  description: "Web design services",
  amountDue: "$1,240.00",
  dueDate: "Mar 3, 2026",
  body: `Hi Jordan,

Hope you're doing well. This is a friendly reminder that invoice INV-1042 for $1,240.00 was due on March 3rd and remains unpaid.

Here are the details for your reference:

If you've already sent payment, please disregard this note. Otherwise, you can settle the balance at your earliest convenience, or reach out if you'd like to discuss a payment plan.

Thanks for your business — let us know if there's anything we can help with.

The Remitrak team`,
} satisfies ReminderEmailProps;

export { ReminderEmail };

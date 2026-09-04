import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

interface ReceiptLineItem {
  description: string;
  amount: string;
}

interface PaymentReceiptEmailProps {
  businessName: string;
  clientName: string;
  invoiceNumber: string;
  description: string;
  amountPaid: string;
  datePaid: string;
  items?: ReceiptLineItem[];
}

// A second, more document-styled receipt design (indigo/purple, structured
// header + boxed total) for accounts that select it in /templates — an
// alternative to the default's "paid stamp" banner look, not a replacement.
// Adapted from a reference invoice layout: the tax/discount math and
// bank/terms footer columns from that reference don't map to any data
// Remitrak tracks, so they're collapsed to a single description/amount line
// (or, once the line-items feature shipped, the same itemized breakdown the
// default template renders — this design's items table is closer to the
// original reference layout than the default's dashed-rule list) plus a
// short footer instead of being fabricated.
export default function PaymentReceiptIndigoEmail({
  businessName,
  clientName,
  invoiceNumber,
  description,
  amountPaid,
  datePaid,
  items,
}: PaymentReceiptEmailProps) {
  const hasItems = Boolean(items && items.length > 0);
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />
        <Preview>
          Receipt for invoice {invoiceNumber} — {amountPaid} paid
        </Preview>
        <Body
          className="m-0 bg-slate-50 p-0"
          style={{ fontFamily: FONT_STACK }}
        >
          <Container className="mx-auto w-full max-w-[600px] px-4 py-10">
            <Section className="rounded-t-xl border border-b-0 border-solid border-indigo-100 bg-white px-8 pt-8 pb-6">
              <Row>
                <Column>
                  <div
                    style={{
                      display: "inline-block",
                      width: 32,
                      height: 32,
                      lineHeight: "32px",
                      borderRadius: 9999,
                      backgroundColor: "#4f46e5",
                      color: "#ffffff",
                      fontSize: 14,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    {businessName.charAt(0).toUpperCase()}
                  </div>
                  <Text className="m-0 mt-2 text-[15px] font-semibold text-slate-900">
                    {businessName}
                  </Text>
                </Column>
                <Column align="right">
                  <Heading className="m-0 text-[24px] font-bold tracking-tight text-indigo-700">
                    RECEIPT
                  </Heading>
                  <Text className="m-0 mt-1 text-[13px] text-slate-500">
                    {datePaid}
                  </Text>
                </Column>
              </Row>

              <Hr className="my-6 border-solid border-indigo-100" />

              <Row>
                <Column>
                  <Text className="m-0 text-[11px] font-semibold tracking-wide text-slate-400">
                    TO
                  </Text>
                  <Text className="m-0 mt-1 text-[14px] font-medium text-slate-900">
                    {clientName}
                  </Text>
                </Column>
                <Column align="right">
                  <Text className="m-0 text-[11px] font-semibold tracking-wide text-slate-400">
                    INVOICE
                  </Text>
                  <Text className="m-0 mt-1 text-[14px] font-medium text-slate-900">
                    {invoiceNumber}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section className="border border-t-0 border-b-0 border-solid border-indigo-100 bg-white px-0 py-0">
              <Row className="bg-indigo-600">
                <Column className="px-8 py-2.5">
                  <Text className="m-0 text-[12px] font-semibold text-white">
                    Description
                  </Text>
                </Column>
                <Column align="right" className="px-8 py-2.5">
                  <Text className="m-0 text-[12px] font-semibold text-white">
                    Amount
                  </Text>
                </Column>
              </Row>
              {hasItems ? (
                <>
                  {items!.map((item, index) => (
                    <Row key={index}>
                      <Column className="px-8 py-4">
                        <Text className="m-0 text-[13px] text-slate-700">
                          {item.description}
                        </Text>
                      </Column>
                      <Column align="right" className="px-8 py-4">
                        <Text className="m-0 text-[13px] font-medium text-slate-900">
                          {item.amount}
                        </Text>
                      </Column>
                    </Row>
                  ))}
                  <Row>
                    <Column className="px-8 py-4">
                      <Text className="m-0 text-[13px] font-semibold text-slate-900">
                        Total
                      </Text>
                    </Column>
                    <Column align="right" className="px-8 py-4">
                      <Text className="m-0 text-[13px] font-semibold text-slate-900">
                        {amountPaid}
                      </Text>
                    </Column>
                  </Row>
                </>
              ) : (
                <Row>
                  <Column className="px-8 py-4">
                    <Text className="m-0 text-[13px] text-slate-700">
                      {description}
                    </Text>
                  </Column>
                  <Column align="right" className="px-8 py-4">
                    <Text className="m-0 text-[13px] font-medium text-slate-900">
                      {amountPaid}
                    </Text>
                  </Column>
                </Row>
              )}
            </Section>

            <Section className="rounded-b-xl border border-t-0 border-solid border-indigo-100 bg-white px-8 pt-2 pb-8">
              <Section className="rounded-lg bg-indigo-600 px-6 py-4">
                <Row>
                  <Column>
                    <Text className="m-0 text-[13px] font-medium text-indigo-50">
                      Amount paid
                    </Text>
                  </Column>
                  <Column align="right">
                    <Text className="m-0 text-[18px] font-bold text-white">
                      {amountPaid}
                    </Text>
                  </Column>
                </Row>
              </Section>

              <Text className="m-0 mt-6 text-center text-[13px] font-medium text-indigo-700">
                Thank you for your business
              </Text>

              <Hr className="my-5 border-solid border-indigo-100" />

              <Text className="m-0 text-center text-[13px] leading-5 text-slate-500">
                Billed by {businessName}. Keep this receipt for your records.
              </Text>
            </Section>

            <Section className="pt-6 text-center">
              <Text className="m-0 mb-1 text-xs text-slate-400">
                This is an automated payment receipt from {businessName}.
              </Text>
              <Text className="m-0 text-xs text-slate-400">
                © {new Date().getFullYear()} {businessName}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

PaymentReceiptIndigoEmail.PreviewProps = {
  businessName: "Remitrak",
  clientName: "Jordan Lee",
  invoiceNumber: "INV-1042",
  description: "Web design services",
  amountPaid: "$1,240.00",
  datePaid: "Mar 3, 2026",
} satisfies PaymentReceiptEmailProps;

export { PaymentReceiptIndigoEmail };
export type { PaymentReceiptEmailProps as PaymentReceiptIndigoEmailProps };

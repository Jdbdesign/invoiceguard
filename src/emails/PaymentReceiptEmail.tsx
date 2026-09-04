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

// Deliberately distinct from ReminderEmail's neutral card: a "paid stamp"
// receipt look (emerald banner, checkmark badge, dashed line-item rule) so a
// financial confirmation reads unmistakably differently from a reminder.
export default function PaymentReceiptEmail({
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
            <Section className="rounded-t-xl bg-emerald-600 px-8 py-8 text-center">
              <div
                style={{
                  display: "inline-block",
                  width: 44,
                  height: 44,
                  lineHeight: "44px",
                  borderRadius: 9999,
                  backgroundColor: "rgba(255,255,255,0.16)",
                  color: "#ffffff",
                  fontSize: 22,
                  textAlign: "center",
                }}
              >
                ✓
              </div>
              <Heading className="m-0 mt-3 text-[20px] font-semibold text-white">
                Payment received
              </Heading>
              <Text className="m-0 mt-1 text-[13px] text-emerald-50">
                Thank you — this invoice is now paid in full.
              </Text>
            </Section>

            <Section className="rounded-b-xl border border-t-0 border-solid border-slate-200 bg-white px-8 py-8">
              <Text className="m-0 mb-1 text-center text-[13px] text-slate-500">
                Amount paid
              </Text>
              <Text className="m-0 mb-6 text-center text-[32px] font-semibold tracking-tight text-slate-900">
                {amountPaid}
              </Text>

              <Hr className="mb-5 border-dashed border-slate-200" />

              <Row>
                <Column>
                  <Text className="m-0 mb-3 text-[13px] leading-5 text-slate-500">
                    Invoice
                  </Text>
                </Column>
                <Column align="right">
                  <Text className="m-0 mb-3 text-[13px] leading-5 font-medium text-slate-900">
                    {invoiceNumber}
                  </Text>
                </Column>
              </Row>
              {hasItems ? (
                <>
                  {items!.map((item, index) => (
                    <Row key={index}>
                      <Column>
                        <Text className="m-0 mb-3 text-[13px] leading-5 text-slate-500">
                          {item.description}
                        </Text>
                      </Column>
                      <Column align="right">
                        <Text className="m-0 mb-3 text-[13px] leading-5 font-medium text-slate-900">
                          {item.amount}
                        </Text>
                      </Column>
                    </Row>
                  ))}
                  <Row>
                    <Column>
                      <Text className="m-0 mb-3 text-[13px] leading-5 font-semibold text-slate-900">
                        Total
                      </Text>
                    </Column>
                    <Column align="right">
                      <Text className="m-0 mb-3 text-[13px] leading-5 font-semibold text-slate-900">
                        {amountPaid}
                      </Text>
                    </Column>
                  </Row>
                </>
              ) : (
                <Row>
                  <Column>
                    <Text className="m-0 mb-3 text-[13px] leading-5 text-slate-500">
                      For
                    </Text>
                  </Column>
                  <Column align="right">
                    <Text className="m-0 mb-3 text-[13px] leading-5 font-medium text-slate-900">
                      {description}
                    </Text>
                  </Column>
                </Row>
              )}
              <Row>
                <Column>
                  <Text className="m-0 mb-3 text-[13px] leading-5 text-slate-500">
                    Date paid
                  </Text>
                </Column>
                <Column align="right">
                  <Text className="m-0 mb-3 text-[13px] leading-5 font-medium text-slate-900">
                    {datePaid}
                  </Text>
                </Column>
              </Row>
              <Row>
                <Column>
                  <Text className="m-0 text-[13px] leading-5 text-slate-500">
                    Paid by
                  </Text>
                </Column>
                <Column align="right">
                  <Text className="m-0 text-[13px] leading-5 font-medium text-slate-900">
                    {clientName}
                  </Text>
                </Column>
              </Row>

              <Hr className="my-5 border-dashed border-slate-200" />

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

PaymentReceiptEmail.PreviewProps = {
  businessName: "Remitrak",
  clientName: "Jordan Lee",
  invoiceNumber: "INV-1042",
  description: "Web design services",
  amountPaid: "$1,240.00",
  datePaid: "Mar 3, 2026",
} satisfies PaymentReceiptEmailProps;

export { PaymentReceiptEmail };
export type { PaymentReceiptEmailProps };

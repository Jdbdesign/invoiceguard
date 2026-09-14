import { describe, expect, it } from "vitest";
import { detectFormat } from "./detectFormat";

describe("detectFormat", () => {
  it("detects OWealth from its column header", () => {
    const text = `Wallet Account
Credit Count
2
Trans. Time Value Date Description Debit(₦) Credit(₦) Balance After(₦) Channel Transaction Reference
07 Aug 2026 01:25:48 07 Aug 2026 OWealth Withdrawal(Transaction Payment) -- 27,000.00 27,000.00 Mobile 260807010201496141065410`;

    expect(detectFormat(text)).toBe("owealth");
  });

  it("detects real GTBank from its boilerplate branding line", () => {
    const text = `This is a computer generated Email. Please address all enquiries to Guaranty Trust Bank Ltd Systems and Control Group 178, Awolowo Road, Ikoyi.
Trans. Date Value. Date Reference Debits Credits Balance Originating Branch Remarks
16-Aug-2026 16-Aug-2026 ' 100.00 287.40 635 AKIN ADESOLA Stamp Duties`;

    expect(detectFormat(text)).toBe("gtbank");
  });

  it("does not misdetect GTBank's own 'Statement Period ... to ...' line as anything else", () => {
    const text = `This is a computer generated Email. Please address all enquiries to Guaranty Trust Bank Ltd Systems and Control Group 178, Awolowo Road, Ikoyi.
Statement Period :14-Aug-2026 to 14-Sep-2026
Trans. Date Value. Date Reference Debits Credits Balance Originating Branch Remarks`;

    expect(detectFormat(text)).toBe("gtbank");
  });

  it("detects Zenith from its bank-name header line", () => {
    const text = `ZENITH BANK PLC
GWARZO Along Malumfashi road, Gwarzo, Kano
ACCOUNT NAME: OLAYINKA ISAIAH JACOBS Account Statement
DATE DESCRIPTION DEBIT CREDIT VALUE DATE BALANCE
Opening Balance 0.00 0.00 350,358.99`;

    expect(detectFormat(text)).toBe("zenith");
  });

  it("detects PalmPay from its column header even though the brand name never appears in the text", () => {
    const text = `Account Statement
Total Money In ₦584,292.94 Statement Period 08/14/2026 - 09/14/2026
Total Money Out ₦1,173,548.00 Print Time 09/14/2026 10:55:53 AM
Transaction Date Transaction Detail Money In (NGN) Money Out (NGN) Transaction ID
09/14/2026 08:58:34 AM Send to OLAYINKA JACOBS -500.00 033ari88eb05`;

    expect(detectFormat(text)).toBe("palmpay");
  });

  it("does not misdetect PalmPay's 'Print Time' header line as a transaction format signal on its own", () => {
    const text = `Print Time 09/14/2026 10:55:53 AM
some unrelated statement text with no known header`;

    expect(detectFormat(text)).toBe("unknown");
  });

  it("returns unknown for text matching none of the known formats", () => {
    expect(detectFormat("this is not a bank statement at all")).toBe("unknown");
  });
});

import { detectFormat } from "./traditionalExtraction/detectFormat";
import { extractOWealth } from "./traditionalExtraction/owealth";
import { extractGtbank } from "./traditionalExtraction/gtbank";
import { extractPalmPay } from "./traditionalExtraction/palmpay";
import { extractZenith } from "./traditionalExtraction/zenith";
import type { TraditionalExtractionResult } from "./traditionalExtraction/shared";

export type { TraditionalExtractionResult } from "./traditionalExtraction/shared";

export function extractTraditional(statementText: string): TraditionalExtractionResult {
  const format = detectFormat(statementText);

  switch (format) {
    case "owealth":
      return extractOWealth(statementText);
    case "palmpay":
      return extractPalmPay(statementText);
    case "zenith":
      return extractZenith(statementText);
    case "gtbank":
      return extractGtbank(statementText);
    case "unknown":
      return {
        rows: [],
        lowConfidenceReasons: [
          "This statement's format wasn't recognized — traditional extraction doesn't support it yet.",
        ],
      };
  }
}

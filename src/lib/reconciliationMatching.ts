export interface MatchableBankTransaction {
  id: string;
  amount: number;
  dateIso: string; // yyyy-mm-dd
}

export interface MatchablePayment {
  id: string;
  amount: number;
  paidDateIso: string; // yyyy-mm-dd
}

export interface TransactionMatchCandidates {
  transactionId: string;
  candidatePaymentIds: string[];
}

const AMOUNT_EPSILON = 0.01;
const TOLERANCE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  const diff = new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(diff) / MS_PER_DAY;
}

export function computeMatchCandidates(
  transactions: MatchableBankTransaction[],
  payments: MatchablePayment[]
): TransactionMatchCandidates[] {
  return transactions.map((transaction) => {
    const candidatePaymentIds = payments
      .filter(
        (payment) =>
          Math.abs(payment.amount - transaction.amount) <= AMOUNT_EPSILON &&
          daysBetween(payment.paidDateIso, transaction.dateIso) <= TOLERANCE_DAYS
      )
      .map((payment) => payment.id);
    return { transactionId: transaction.id, candidatePaymentIds };
  });
}

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "receiptSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "sendReceiptImmediately" BOOLEAN NOT NULL DEFAULT false;

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_OWNER_EMAIL = "dev@invoiceguard.local";
const SEED_OWNER_PASSWORD = "dev-only-password";

const clients = [
  {
    id: "c1",
    name: "Northwind Design Co.",
    email: "billing@northwinddesign.co",
    phone: "(503) 555-0142",
  },
  {
    id: "c2",
    name: "Bramble & Finch Ltd",
    email: "accounts@brambleandfinch.com",
    phone: "(415) 555-0198",
  },
  {
    id: "c3",
    name: "Solstice Robotics",
    email: "ap@solsticerobotics.io",
    phone: "(206) 555-0133",
  },
  {
    id: "c4",
    name: "Harbor & Vine Market",
    email: "finance@harborvine.market",
    phone: "(312) 555-0177",
  },
];

const invoices = [
  {
    id: "INV-2201",
    clientId: "c1",
    amount: 4200,
    amountPaid: 0,
    issueDate: "2026-08-01",
    dueDate: "2026-09-05",
    status: "unpaid",
    description: "Brand identity refresh — Phase 2",
  },
  {
    id: "INV-2187",
    clientId: "c1",
    amount: 1800,
    amountPaid: 0,
    issueDate: "2026-07-10",
    dueDate: "2026-08-05",
    status: "unpaid",
    description: "Packaging illustration set",
  },
  {
    id: "INV-2144",
    clientId: "c2",
    amount: 9500,
    amountPaid: 4750,
    issueDate: "2026-06-01",
    dueDate: "2026-07-10",
    status: "payment_plan",
    description: "Q3 wholesale catalog production",
  },
  {
    id: "INV-2098",
    clientId: "c2",
    amount: 2300,
    amountPaid: 2300,
    issueDate: "2026-05-15",
    dueDate: "2026-06-15",
    status: "paid",
    description: "Storefront signage refresh",
  },
  {
    id: "INV-2051",
    clientId: "c3",
    amount: 15750,
    amountPaid: 0,
    issueDate: "2026-05-01",
    dueDate: "2026-06-07",
    status: "unpaid",
    description: "Robotics arm — custom tooling batch",
  },
  {
    id: "INV-2033",
    clientId: "c3",
    amount: 3100,
    amountPaid: 1000,
    issueDate: "2026-04-20",
    dueDate: "2026-06-20",
    status: "partial",
    description: "Firmware consulting — June sprint",
  },
  {
    id: "INV-2176",
    clientId: "c4",
    amount: 6000,
    amountPaid: 2000,
    issueDate: "2026-06-20",
    dueDate: "2026-07-20",
    status: "payment_plan",
    description: "Cold storage installation — Unit B",
  },
  {
    id: "INV-2210",
    clientId: "c4",
    amount: 980,
    amountPaid: 980,
    issueDate: "2026-08-10",
    dueDate: "2026-08-20",
    status: "paid",
    description: "Produce delivery — August restock",
  },
];

const paymentPlans = [
  {
    id: "PP-01",
    invoiceId: "INV-2144",
    totalAmount: 9500,
    startDate: "2026-07-15",
    installments: [
      { id: "PP-01-1", amount: 2375, dueDate: "2026-07-15", paid: true, paidDate: "2026-07-16" },
      { id: "PP-01-2", amount: 2375, dueDate: "2026-08-15", paid: true, paidDate: "2026-08-16" },
      { id: "PP-01-3", amount: 2375, dueDate: "2026-08-27", paid: false },
      { id: "PP-01-4", amount: 2375, dueDate: "2026-09-27", paid: false },
    ],
  },
  {
    id: "PP-02",
    invoiceId: "INV-2176",
    totalAmount: 6000,
    startDate: "2026-08-01",
    installments: [
      { id: "PP-02-1", amount: 2000, dueDate: "2026-08-01", paid: true, paidDate: "2026-08-01" },
      { id: "PP-02-2", amount: 2000, dueDate: "2026-08-29", paid: false },
      { id: "PP-02-3", amount: 2000, dueDate: "2026-09-29", paid: false },
    ],
  },
];

const activityLog = [
  {
    id: "a1",
    clientId: "c3",
    invoiceId: "INV-2051",
    type: "reminder_sent",
    stage: "final",
    date: "2026-08-23",
    message:
      "Final notice: invoice INV-2051 for $15,750.00 is now 77 days past due. Immediate payment required to avoid escalation.",
  },
  {
    id: "a2",
    clientId: "c4",
    invoiceId: "INV-2176",
    type: "installment_paid",
    date: "2026-08-22",
    message: "Installment 1 of 3 received — $2,000.00 toward payment plan PP-02.",
  },
  {
    id: "a3",
    clientId: "c1",
    invoiceId: "INV-2187",
    type: "client_reply",
    date: "2026-08-20",
    message: "Client replied: \"Will process payment by end of week, apologies for the delay.\"",
  },
  {
    id: "a4",
    clientId: "c1",
    invoiceId: "INV-2187",
    type: "reminder_sent",
    stage: "firm",
    date: "2026-08-19",
    message: "Firm reminder sent: invoice INV-2187 for $1,800.00 is 14 days past due.",
  },
  {
    id: "a5",
    clientId: "c2",
    invoiceId: "INV-2144",
    type: "installment_paid",
    date: "2026-08-16",
    message: "Installment 2 of 4 received — $2,375.00 toward payment plan PP-01.",
  },
  {
    id: "a6",
    clientId: "c4",
    invoiceId: "INV-2210",
    type: "payment_received",
    date: "2026-08-12",
    message: "Invoice INV-2210 paid in full — $980.00 received.",
  },
  {
    id: "a7",
    clientId: "c2",
    invoiceId: "INV-2144",
    type: "reminder_sent",
    stage: "friendly",
    date: "2026-08-14",
    message: "Friendly reminder sent: installment of $2,375.00 due 2026-08-15.",
  },
  {
    id: "a8",
    clientId: "c3",
    invoiceId: "INV-2033",
    type: "client_reply",
    date: "2026-08-10",
    message: "Client replied: \"Forwarded to our AP team, no timeline given yet.\"",
  },
  {
    id: "a9",
    clientId: "c3",
    invoiceId: "INV-2033",
    type: "reminder_sent",
    stage: "firm",
    date: "2026-08-05",
    message: "Firm reminder sent: invoice INV-2033 balance of $2,100.00 is 46 days past due.",
  },
  {
    id: "a10",
    clientId: "c1",
    invoiceId: "INV-2187",
    type: "reminder_sent",
    stage: "friendly",
    date: "2026-08-05",
    message: "Friendly reminder sent: invoice INV-2187 for $1,800.00 was due 2026-08-05.",
  },
  {
    id: "a11",
    clientId: "c3",
    invoiceId: "INV-2051",
    type: "reminder_sent",
    stage: "friendly",
    date: "2026-07-30",
    message: "Friendly reminder sent: invoice INV-2051 for $15,750.00 was due 2026-06-07.",
  },
  {
    id: "a12",
    clientId: "c4",
    invoiceId: "INV-2176",
    type: "plan_created",
    date: "2026-07-22",
    message: "Payment plan established for INV-2176 — $6,000.00 across 3 monthly installments.",
  },
  {
    id: "a13",
    clientId: "c2",
    invoiceId: "INV-2144",
    type: "plan_created",
    date: "2026-07-18",
    message: "Payment plan established for INV-2144 — $9,500.00 across 4 monthly installments.",
  },
  {
    id: "a14",
    clientId: "c2",
    invoiceId: "INV-2144",
    type: "installment_paid",
    date: "2026-07-16",
    message: "Installment 1 of 4 received — $2,375.00 toward payment plan PP-01.",
  },
  {
    id: "a15",
    clientId: "c2",
    invoiceId: "INV-2144",
    type: "client_reply",
    date: "2026-07-12",
    message: "Client replied: \"Cash flow is tight this quarter — can we set up a payment plan?\"",
  },
  {
    id: "a16",
    clientId: "c2",
    invoiceId: "INV-2098",
    type: "payment_received",
    date: "2026-06-18",
    message: "Invoice INV-2098 paid in full — $2,300.00 received.",
  },
];

async function main() {
  console.log("Seeding database...");

  await prisma.activityLog.deleteMany();
  await prisma.installment.deleteMany();
  await prisma.paymentPlan.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.client.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.user.deleteMany({ where: { email: SEED_OWNER_EMAIL } });

  const seedOwner = await prisma.user.create({
    data: {
      email: SEED_OWNER_EMAIL,
      passwordHash: await bcrypt.hash(SEED_OWNER_PASSWORD, 10),
    },
  });
  console.log(`Created seed owner ${SEED_OWNER_EMAIL} (dev-only account, password: ${SEED_OWNER_PASSWORD})`);

  for (const c of clients) {
    await prisma.client.create({ data: { ...c, ownerId: seedOwner.id } });
  }

  for (const inv of invoices) {
    await prisma.invoice.create({
      data: {
        id: inv.id,
        clientId: inv.clientId,
        invoiceNumber: inv.id,
        description: inv.description,
        amount: inv.amount,
        balance: Math.max(0, inv.amount - inv.amountPaid),
        dueDate: new Date(inv.dueDate),
        status: inv.status,
        createdAt: new Date(inv.issueDate),
      },
    });
  }

  for (const plan of paymentPlans) {
    await prisma.paymentPlan.create({
      data: {
        id: plan.id,
        invoiceId: plan.invoiceId,
        totalAmount: plan.totalAmount,
        startDate: new Date(plan.startDate),
        installments: {
          create: plan.installments.map((inst, idx) => ({
            id: inst.id,
            installmentNumber: idx + 1,
            amount: inst.amount,
            dueDate: new Date(inst.dueDate),
            paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
            status: inst.paid ? "paid" : "pending",
          })),
        },
      },
    });
  }

  for (const entry of activityLog) {
    await prisma.activityLog.create({
      data: {
        id: entry.id,
        clientId: entry.clientId,
        invoiceId: entry.invoiceId ?? null,
        type: entry.type,
        stage: entry.stage ?? null,
        message: entry.message,
        createdAt: new Date(entry.date),
      },
    });
  }

  await prisma.settings.create({
    data: {
      id: "settings",
      ownerId: seedOwner.id,
      friendlyReminderDays: 3,
      firmReminderDays: 15,
      finalNoticeDays: 45,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

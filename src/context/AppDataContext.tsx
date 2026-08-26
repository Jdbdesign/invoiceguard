"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/context/ToastContext";
import type {
  ActivityEntry,
  Client,
  Invoice,
  PaymentPlan,
  ReminderSchedule,
} from "@/lib/types";

interface NewClientInput {
  name: string;
  email: string;
  phone: string;
}

interface NewInvoiceInput {
  clientId: string;
  amount: number;
  dueDate: string;
  description: string;
}

interface AppDataContextValue {
  clients: Client[];
  invoices: Invoice[];
  paymentPlans: PaymentPlan[];
  activityLog: ActivityEntry[];
  reminderSchedule: ReminderSchedule;
  loading: boolean;
  addClient: (input: NewClientInput) => Promise<Client>;
  addInvoice: (input: NewInvoiceInput) => Promise<Invoice>;
  markInvoicePaid: (invoiceId: string) => Promise<void>;
  sendReminderNow: (invoiceId: string) => Promise<void>;
  toggleInstallmentPaid: (planId: string, installmentId: string) => Promise<void>;
  updateReminderSchedule: (schedule: ReminderSchedule) => Promise<void>;
  runDailyCheck: () => Promise<{ remindersSent: number }>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

const DEFAULT_SCHEDULE: ReminderSchedule = {
  friendlyDays: 3,
  firmDays: 15,
  finalDays: 45,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [reminderSchedule, setReminderSchedule] =
    useState<ReminderSchedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [clientsRes, invoicesRes, plansRes, activityRes, settingsRes] =
          await Promise.all([
            fetchJson<Client[]>("/api/clients"),
            fetchJson<Invoice[]>("/api/invoices"),
            fetchJson<PaymentPlan[]>("/api/payment-plans"),
            fetchJson<ActivityEntry[]>("/api/activity"),
            fetchJson<ReminderSchedule>("/api/settings"),
          ]);
        if (cancelled) return;
        setClients(clientsRes);
        setInvoices(invoicesRes);
        setPaymentPlans(plansRes);
        setActivityLog(activityRes);
        setReminderSchedule(settingsRes);
      } catch (error) {
        console.error("Failed to load InvoiceGuard data", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const addClient = useCallback(async (input: NewClientInput): Promise<Client> => {
    const client = await fetchJson<Client>("/api/clients", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setClients((prev) => [client, ...prev]);
    return client;
  }, []);

  const addInvoice = useCallback(
    async (input: NewInvoiceInput): Promise<Invoice> => {
      const invoice = await fetchJson<Invoice>("/api/invoices", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setInvoices((prev) => [invoice, ...prev]);
      return invoice;
    },
    []
  );

  const markInvoicePaid = useCallback(async (invoiceId: string) => {
    const result = await fetchJson<{ invoice: Invoice; activity: ActivityEntry | null }>(
      `/api/invoices/${invoiceId}/mark-paid`,
      { method: "POST" }
    );
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? result.invoice : inv))
    );
    if (result.activity) {
      setActivityLog((prev) => [result.activity as ActivityEntry, ...prev]);
    }
  }, []);

  const sendReminderNow = useCallback(
    async (invoiceId: string) => {
      try {
        const result = await fetchJson<{
          subject: string;
          body: string;
          activity: ActivityEntry;
        }>(`/api/invoices/${invoiceId}/send-reminder`, { method: "POST" });
        setActivityLog((prev) => [result.activity, ...prev]);
        setDraft({ subject: result.subject, body: result.body });
      } catch (error) {
        console.error("Failed to send reminder", error);
        showToast(
          error instanceof Error ? error.message : "Failed to draft reminder"
        );
      }
    },
    [showToast]
  );

  const toggleInstallmentPaid = useCallback(
    async (planId: string, installmentId: string) => {
      const result = await fetchJson<{
        installment: PaymentPlan["installments"][number];
        activity: ActivityEntry | null;
      }>(`/api/installments/${installmentId}`, { method: "PATCH" });

      setPaymentPlans((prev) =>
        prev.map((plan) =>
          plan.id !== planId
            ? plan
            : {
                ...plan,
                installments: plan.installments.map((inst) =>
                  inst.id === installmentId ? result.installment : inst
                ),
              }
        )
      );
      if (result.activity) {
        setActivityLog((prev) => [result.activity as ActivityEntry, ...prev]);
      }
    },
    []
  );

  const updateReminderSchedule = useCallback(
    async (schedule: ReminderSchedule) => {
      const updated = await fetchJson<ReminderSchedule>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(schedule),
      });
      setReminderSchedule(updated);
    },
    []
  );

  const runDailyCheck = useCallback(async () => {
    const result = await fetchJson<{ remindersSent: number }>(
      "/api/cron/check-overdue",
      { method: "POST" }
    );
    const [activityRes] = await Promise.all([
      fetchJson<ActivityEntry[]>("/api/activity"),
    ]);
    setActivityLog(activityRes);
    return result;
  }, []);

  const value = useMemo(
    () => ({
      clients,
      invoices,
      paymentPlans,
      activityLog,
      reminderSchedule,
      loading,
      addClient,
      addInvoice,
      markInvoicePaid,
      sendReminderNow,
      toggleInstallmentPaid,
      updateReminderSchedule,
      runDailyCheck,
    }),
    [
      clients,
      invoices,
      paymentPlans,
      activityLog,
      reminderSchedule,
      loading,
      addClient,
      addInvoice,
      markInvoicePaid,
      sendReminderNow,
      toggleInstallmentPaid,
      updateReminderSchedule,
      runDailyCheck,
    ]
  );

  return (
    <AppDataContext.Provider value={value}>
      {children}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title="Drafted reminder email"
      >
        {draft && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 border-b border-slate-100 pb-3 text-sm font-medium text-slate-900">
              {draft.subject}
            </p>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
              {draft.body}
            </pre>
          </div>
        )}
      </Modal>
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

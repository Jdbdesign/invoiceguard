"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { todayIso, getInvoiceBalance } from "@/lib/utils";
import { computeInstallmentSchedule, type PaymentPlanFrequency } from "@/lib/paymentPlan";
import { requestPasswordConfirmation } from "@/lib/passwordConfirmClient";
import { PASSWORD_RECONFIRM_DEFAULT_MINUTES } from "@/lib/passwordReconfirmBounds";
import { PasswordConfirmModal } from "@/components/auth/PasswordConfirmModal";
import type {
  ActivityEntry,
  AppSettings,
  Client,
  Invoice,
  PaymentPlan,
  ReminderSchedule,
  ReminderStage,
} from "@/lib/types";

interface NewClientInput {
  name: string;
  email: string;
  phone: string;
  currency: string;
}

interface NewInvoiceInput {
  clientId: string;
  amount: number;
  dueDate: string;
  description: string;
}

interface UpdateClientInput {
  name: string;
  email: string;
  phone: string;
  currency: string;
}

interface UpdateInvoiceInput {
  clientId: string;
  amount: number;
  dueDate: string;
  description: string;
  status: Invoice["status"];
}

interface CreatePaymentPlanInput {
  installmentCount: number;
  firstDueDate: string;
  frequency: PaymentPlanFrequency;
  labels?: string[];
}

interface AppDataContextValue {
  clients: Client[];
  invoices: Invoice[];
  paymentPlans: PaymentPlan[];
  activityLog: ActivityEntry[];
  reminderSchedule: ReminderSchedule;
  passwordReconfirmMinutes: number;
  loading: boolean;
  addClient: (input: NewClientInput) => Promise<Client>;
  addInvoice: (input: NewInvoiceInput) => Promise<Invoice>;
  updateClient: (id: string, input: UpdateClientInput) => Promise<Client>;
  deleteClient: (id: string) => Promise<void>;
  updateInvoice: (invoiceNumber: string, input: UpdateInvoiceInput) => Promise<Invoice>;
  deleteInvoice: (invoiceNumber: string) => Promise<void>;
  createPaymentPlan: (
    invoice: Invoice,
    input: CreatePaymentPlanInput
  ) => Promise<PaymentPlan>;
  markInvoicePaid: (invoiceId: string) => Promise<void>;
  draftReminder: (
    invoiceId: string
  ) => Promise<{ subject: string; body: string; stage: ReminderStage | null }>;
  sendReminder: (
    invoiceId: string,
    draft: { subject: string; body: string; stage: ReminderStage | null }
  ) => Promise<void>;
  toggleInstallmentPaid: (planId: string, installmentId: string) => Promise<void>;
  updateInstallmentLabel: (
    planId: string,
    installmentId: string,
    label: string
  ) => Promise<void>;
  settlePaymentPlan: (invoiceId: string) => Promise<void>;
  updateReminderSchedule: (schedule: ReminderSchedule) => Promise<void>;
  updatePasswordReconfirmMinutes: (minutes: number) => Promise<void>;
  runDailyCheck: () => Promise<{ remindersSent: number }>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

const DEFAULT_SCHEDULE: ReminderSchedule = {
  friendlyDays: 3,
  firmDays: 15,
  finalDays: 45,
};

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  isRetryAfterConfirm = false
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (
      !isRetryAfterConfirm &&
      res.status === 403 &&
      body.code === "PASSWORD_CONFIRMATION_REQUIRED"
    ) {
      await requestPasswordConfirmation();
      return fetchJson<T>(url, init, true);
    }
    throw new Error(body.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [reminderSchedule, setReminderSchedule] =
    useState<ReminderSchedule>(DEFAULT_SCHEDULE);
  const [passwordReconfirmMinutes, setPasswordReconfirmMinutes] = useState<number>(
    PASSWORD_RECONFIRM_DEFAULT_MINUTES
  );
  const [loading, setLoading] = useState(true);

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
            fetchJson<AppSettings>("/api/settings"),
          ]);
        if (cancelled) return;
        setClients(clientsRes);
        setInvoices(invoicesRes);
        setPaymentPlans(plansRes);
        setActivityLog(activityRes);
        setReminderSchedule(settingsRes);
        setPasswordReconfirmMinutes(settingsRes.passwordReconfirmMinutes);
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

  const updateClient = useCallback(
    async (id: string, input: UpdateClientInput): Promise<Client> => {
      const client = await fetchJson<Client>(`/api/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setClients((prev) => prev.map((c) => (c.id === id ? client : c)));
      return client;
    },
    []
  );

  const deleteClient = useCallback(async (id: string) => {
    await fetchJson<{ success: true }>(`/api/clients/${id}`, {
      method: "DELETE",
    });
    setClients((prev) => prev.filter((c) => c.id !== id));
    setInvoices((prev) => prev.filter((inv) => inv.clientId !== id));
    setPaymentPlans((prev) => prev.filter((p) => p.clientId !== id));
    setActivityLog((prev) => prev.filter((a) => a.clientId !== id));
  }, []);

  const updateInvoice = useCallback(
    async (invoiceNumber: string, input: UpdateInvoiceInput): Promise<Invoice> => {
      const invoice = await fetchJson<Invoice>(`/api/invoices/${invoiceNumber}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceNumber ? invoice : inv))
      );
      return invoice;
    },
    []
  );

  const deleteInvoice = useCallback(async (invoiceNumber: string) => {
    await fetchJson<{ success: true }>(`/api/invoices/${invoiceNumber}`, {
      method: "DELETE",
    });
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceNumber));
    setPaymentPlans((prev) => prev.filter((p) => p.invoiceId !== invoiceNumber));
    setActivityLog((prev) => prev.filter((a) => a.invoiceId !== invoiceNumber));
  }, []);

  const markInvoicePaid = useCallback(async (invoiceId: string) => {
    let previous: Invoice | undefined;
    setInvoices((prev) => {
      previous = prev.find((inv) => inv.id === invoiceId);
      return prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: "paid", amountPaid: inv.amount } : inv
      );
    });
    try {
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
    } catch (error) {
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId && previous ? previous : inv))
      );
      throw error;
    }
  }, []);

  const draftReminder = useCallback(async (invoiceId: string) => {
    return fetchJson<{
      subject: string;
      body: string;
      stage: ReminderStage | null;
    }>(`/api/invoices/${invoiceId}/draft-reminder`, { method: "POST" });
  }, []);

  const sendReminder = useCallback(
    async (
      invoiceId: string,
      draft: { subject: string; body: string; stage: ReminderStage | null }
    ) => {
      const result = await fetchJson<{ activity: ActivityEntry }>(
        `/api/invoices/${invoiceId}/send-reminder`,
        { method: "POST", body: JSON.stringify(draft) }
      );
      setActivityLog((prev) => [result.activity, ...prev]);
    },
    []
  );

  const toggleInstallmentPaid = useCallback(
    async (planId: string, installmentId: string) => {
      let previousInstallment: PaymentPlan["installments"][number] | undefined;
      let previousInvoice: Invoice | undefined;
      let invoiceId: string | undefined;

      setPaymentPlans((prev) =>
        prev.map((plan) => {
          if (plan.id !== planId) return plan;
          invoiceId = plan.invoiceId;
          return {
            ...plan,
            installments: plan.installments.map((inst) => {
              if (inst.id !== installmentId) return inst;
              previousInstallment = inst;
              return {
                ...inst,
                paid: !inst.paid,
                paidDate: !inst.paid ? todayIso() : undefined,
              };
            }),
          };
        })
      );

      // The invoice's balance/status move in lockstep with the installment
      // (see the PATCH route) — mirror that here so "Total owed" and the
      // invoice list don't wait for a refetch to catch up, matching how
      // markInvoicePaid/settlePaymentPlan already keep both in sync.
      if (invoiceId && previousInstallment) {
        const amount = previousInstallment.amount;
        const nowPaid = !previousInstallment.paid;
        setInvoices((prev) =>
          prev.map((inv) => {
            if (inv.id !== invoiceId) return inv;
            previousInvoice = inv;
            const newAmountPaid = Math.max(
              0,
              Math.min(inv.amount, inv.amountPaid + (nowPaid ? amount : -amount))
            );
            const newStatus =
              newAmountPaid >= inv.amount
                ? "paid"
                : inv.status === "paid"
                  ? "payment_plan"
                  : inv.status;
            return { ...inv, amountPaid: newAmountPaid, status: newStatus };
          })
        );
      }

      try {
        const result = await fetchJson<{
          installment: PaymentPlan["installments"][number];
          invoice: Invoice;
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
        setInvoices((prev) =>
          prev.map((inv) => (inv.id === result.invoice.id ? result.invoice : inv))
        );
        if (result.activity) {
          setActivityLog((prev) => [result.activity as ActivityEntry, ...prev]);
        }
      } catch (error) {
        setPaymentPlans((prev) =>
          prev.map((plan) =>
            plan.id !== planId
              ? plan
              : {
                  ...plan,
                  installments: plan.installments.map((inst) =>
                    inst.id === installmentId && previousInstallment ? previousInstallment : inst
                  ),
                }
          )
        );
        if (previousInvoice) {
          const restored = previousInvoice;
          setInvoices((prev) =>
            prev.map((inv) => (inv.id === restored.id ? restored : inv))
          );
        }
        throw error;
      }
    },
    []
  );

  const updateInstallmentLabel = useCallback(
    async (planId: string, installmentId: string, label: string) => {
      let previous: PaymentPlan["installments"][number] | undefined;
      setPaymentPlans((prev) =>
        prev.map((plan) =>
          plan.id !== planId
            ? plan
            : {
                ...plan,
                installments: plan.installments.map((inst) => {
                  if (inst.id !== installmentId) return inst;
                  previous = inst;
                  return { ...inst, label: label.trim() || undefined };
                }),
              }
        )
      );
      try {
        const result = await fetchJson<{
          installment: PaymentPlan["installments"][number];
          activity: ActivityEntry | null;
        }>(`/api/installments/${installmentId}`, {
          method: "PATCH",
          body: JSON.stringify({ label }),
        });
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
      } catch (error) {
        setPaymentPlans((prev) =>
          prev.map((plan) =>
            plan.id !== planId
              ? plan
              : {
                  ...plan,
                  installments: plan.installments.map((inst) =>
                    inst.id === installmentId && previous ? previous : inst
                  ),
                }
          )
        );
        throw error;
      }
    },
    []
  );

  const settlePaymentPlan = useCallback(async (invoiceId: string) => {
    let previousPlan: PaymentPlan | undefined;
    let previousInvoice: Invoice | undefined;

    setPaymentPlans((prev) => {
      previousPlan = prev.find((p) => p.invoiceId === invoiceId);
      if (!previousPlan) return prev;
      const planId = previousPlan.id;
      return prev.map((plan) =>
        plan.id !== planId
          ? plan
          : {
              ...plan,
              installments: plan.installments.map((inst) =>
                inst.paid ? inst : { ...inst, paid: true, paidDate: todayIso() }
              ),
            }
      );
    });
    setInvoices((prev) => {
      previousInvoice = prev.find((inv) => inv.id === invoiceId);
      return prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: "paid", amountPaid: inv.amount } : inv
      );
    });

    try {
      const result = await fetchJson<{
        installments: PaymentPlan["installments"];
        invoice: Invoice;
        activity: ActivityEntry;
      }>(`/api/invoices/${invoiceId}/settle-payment-plan`, { method: "POST" });

      const settledPlanId = previousPlan?.id;
      setPaymentPlans((prev) =>
        prev.map((plan) =>
          settledPlanId && plan.id === settledPlanId
            ? { ...plan, installments: result.installments }
            : plan
        )
      );
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === result.invoice.id ? result.invoice : inv))
      );
      setActivityLog((prev) => [result.activity, ...prev]);
    } catch (error) {
      const restoredPlan = previousPlan;
      const restoredInvoice = previousInvoice;
      if (restoredPlan) {
        setPaymentPlans((prev) =>
          prev.map((plan) => (plan.id === restoredPlan.id ? restoredPlan : plan))
        );
      }
      if (restoredInvoice) {
        setInvoices((prev) =>
          prev.map((inv) => (inv.id === restoredInvoice.id ? restoredInvoice : inv))
        );
      }
      throw error;
    }
  }, []);

  const createPaymentPlan = useCallback(
    async (invoice: Invoice, input: CreatePaymentPlanInput): Promise<PaymentPlan> => {
      const remaining = getInvoiceBalance(invoice);
      const schedule = computeInstallmentSchedule(
        remaining,
        input.installmentCount,
        input.firstDueDate,
        input.frequency
      );
      const tempId = `temp-plan-${invoice.id}`;
      const optimisticPlan: PaymentPlan = {
        id: tempId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        totalAmount: remaining,
        startDate: input.firstDueDate,
        installments: schedule.map((installment, index) => ({
          id: `${tempId}-${index}`,
          amount: installment.amount,
          dueDate: installment.dueDate,
          paid: false,
          label: input.labels?.[index],
        })),
      };

      setPaymentPlans((prev) => [optimisticPlan, ...prev]);
      try {
        const result = await fetchJson<{ plan: PaymentPlan; activity: ActivityEntry }>(
          `/api/invoices/${invoice.id}/payment-plan`,
          { method: "POST", body: JSON.stringify(input) }
        );
        setPaymentPlans((prev) =>
          prev.map((p) => (p.id === tempId ? result.plan : p))
        );
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoice.id ? { ...inv, status: "payment_plan" } : inv
          )
        );
        setActivityLog((prev) => [result.activity, ...prev]);
        return result.plan;
      } catch (error) {
        setPaymentPlans((prev) => prev.filter((p) => p.id !== tempId));
        throw error;
      }
    },
    []
  );

  const updateReminderSchedule = useCallback(
    async (schedule: ReminderSchedule) => {
      const updated = await fetchJson<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(schedule),
      });
      setReminderSchedule(updated);
    },
    []
  );

  const updatePasswordReconfirmMinutes = useCallback(async (minutes: number) => {
    const updated = await fetchJson<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ passwordReconfirmMinutes: minutes }),
    });
    setPasswordReconfirmMinutes(updated.passwordReconfirmMinutes);
  }, []);

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
      passwordReconfirmMinutes,
      loading,
      addClient,
      addInvoice,
      updateClient,
      deleteClient,
      updateInvoice,
      deleteInvoice,
      createPaymentPlan,
      markInvoicePaid,
      draftReminder,
      sendReminder,
      toggleInstallmentPaid,
      updateInstallmentLabel,
      settlePaymentPlan,
      updateReminderSchedule,
      updatePasswordReconfirmMinutes,
      runDailyCheck,
    }),
    [
      clients,
      invoices,
      paymentPlans,
      activityLog,
      reminderSchedule,
      passwordReconfirmMinutes,
      loading,
      addClient,
      addInvoice,
      updateClient,
      deleteClient,
      updateInvoice,
      deleteInvoice,
      createPaymentPlan,
      markInvoicePaid,
      draftReminder,
      sendReminder,
      toggleInstallmentPaid,
      updateInstallmentLabel,
      settlePaymentPlan,
      updateReminderSchedule,
      updatePasswordReconfirmMinutes,
      runDailyCheck,
    ]
  );

  return (
    <AppDataContext.Provider value={value}>
      {children}
      <PasswordConfirmModal />
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

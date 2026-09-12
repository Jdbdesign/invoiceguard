"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { getTemplatePreview } from "@/lib/templates";
import {
  PASSWORD_RECONFIRM_MIN_MINUTES,
  PASSWORD_RECONFIRM_MAX_MINUTES,
} from "@/lib/passwordReconfirmBounds";
import { LogoUploadField } from "@/components/business/LogoUploadField";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { BUSINESS_TYPES } from "@/lib/businessTypes";
import { COUNTRIES } from "@/lib/countries";
import type { ReminderStage } from "@/lib/types";

const STAGES: {
  key: keyof typeof STAGE_META;
  scheduleKey: "friendlyDays" | "firmDays" | "finalDays";
}[] = [
  { key: "friendly", scheduleKey: "friendlyDays" },
  { key: "firm", scheduleKey: "firmDays" },
  { key: "final", scheduleKey: "finalDays" },
];

const STAGE_META: Record<
  ReminderStage,
  { title: string; description: string; variant: "warning" | "orange" | "danger" }
> = {
  friendly: {
    title: "Friendly reminder",
    description: "A gentle nudge sent shortly after the due date.",
    variant: "warning",
  },
  firm: {
    title: "Firm reminder",
    description: "A direct follow-up when the invoice is clearly overdue.",
    variant: "orange",
  },
  final: {
    title: "Final notice",
    description: "A firm, urgent last request for payment.",
    variant: "danger",
  },
};

export default function SettingsPage() {
  const {
    reminderSchedule,
    updateReminderSchedule,
    passwordReconfirmMinutes,
    updatePasswordReconfirmMinutes,
    sendReceiptImmediately,
    updateSendReceiptImmediately,
    businessProfile,
    updateBusinessProfile,
    bankStatementExtractionMethod,
    updateBankStatementExtractionMethod,
    runDailyCheck,
  } = useAppData();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(reminderSchedule);
  const [syncedSchedule, setSyncedSchedule] = useState(reminderSchedule);
  const [expandedStage, setExpandedStage] = useState<ReminderStage | null>("friendly");
  const [checkingOverdue, setCheckingOverdue] = useState(false);

  const [reconfirmDraft, setReconfirmDraft] = useState(passwordReconfirmMinutes);
  const [syncedReconfirmMinutes, setSyncedReconfirmMinutes] = useState(passwordReconfirmMinutes);
  const [savingReconfirm, setSavingReconfirm] = useState(false);

  const [savingReceiptSetting, setSavingReceiptSetting] = useState(false);
  const [savingExtractionMethod, setSavingExtractionMethod] = useState(false);

  const [businessDraft, setBusinessDraft] = useState(businessProfile);
  const [syncedBusinessProfile, setSyncedBusinessProfile] = useState(businessProfile);
  const [savingBusiness, setSavingBusiness] = useState(false);

  if (businessProfile !== syncedBusinessProfile) {
    setSyncedBusinessProfile(businessProfile);
    setBusinessDraft(businessProfile);
  }

  const isBusinessDirty =
    businessDraft.businessName !== businessProfile.businessName ||
    businessDraft.businessType !== businessProfile.businessType ||
    businessDraft.logoUrl !== businessProfile.logoUrl ||
    businessDraft.businessEmail !== businessProfile.businessEmail ||
    businessDraft.businessPhone !== businessProfile.businessPhone ||
    businessDraft.country !== businessProfile.country;

  async function handleSaveBusiness() {
    setSavingBusiness(true);
    try {
      await updateBusinessProfile({
        businessName: businessDraft.businessName ?? "",
        businessType: businessDraft.businessType ?? "",
        logoUrl: businessDraft.logoUrl ?? "",
        businessEmail: businessDraft.businessEmail ?? "",
        businessPhone: businessDraft.businessPhone ?? "",
        country: businessDraft.country ?? "",
      });
      showToast("Business profile saved");
    } catch {
      showToast("Failed to save — see console for details");
    } finally {
      setSavingBusiness(false);
    }
  }

  if (reminderSchedule !== syncedSchedule) {
    setSyncedSchedule(reminderSchedule);
    setDraft(reminderSchedule);
  }

  if (passwordReconfirmMinutes !== syncedReconfirmMinutes) {
    setSyncedReconfirmMinutes(passwordReconfirmMinutes);
    setReconfirmDraft(passwordReconfirmMinutes);
  }

  const isDirty =
    draft.friendlyDays !== reminderSchedule.friendlyDays ||
    draft.firmDays !== reminderSchedule.firmDays ||
    draft.finalDays !== reminderSchedule.finalDays;

  const isReconfirmValid =
    Number.isInteger(reconfirmDraft) &&
    reconfirmDraft >= PASSWORD_RECONFIRM_MIN_MINUTES &&
    reconfirmDraft <= PASSWORD_RECONFIRM_MAX_MINUTES;
  const isReconfirmDirty = reconfirmDraft !== passwordReconfirmMinutes;

  async function handleSave() {
    await updateReminderSchedule(draft);
    showToast("Reminder schedule saved");
  }

  async function handleSaveReconfirm() {
    if (!isReconfirmValid) return;
    setSavingReconfirm(true);
    try {
      await updatePasswordReconfirmMinutes(reconfirmDraft);
      showToast("Password re-confirmation window saved");
    } catch {
      showToast("Failed to save — see console for details");
    } finally {
      setSavingReconfirm(false);
    }
  }

  async function handleSetSendReceiptImmediately(enabled: boolean) {
    if (enabled === sendReceiptImmediately || savingReceiptSetting) return;
    setSavingReceiptSetting(true);
    try {
      await updateSendReceiptImmediately(enabled);
      showToast(
        enabled
          ? "Receipts will now send automatically"
          : "Receipts will now wait for your review"
      );
    } catch {
      showToast("Failed to save — see console for details");
    } finally {
      setSavingReceiptSetting(false);
    }
  }

  async function handleSetExtractionMethod(method: "ai" | "traditional") {
    if (method === bankStatementExtractionMethod || savingExtractionMethod) return;
    setSavingExtractionMethod(true);
    try {
      await updateBankStatementExtractionMethod(method);
      showToast(
        method === "traditional"
          ? "Bank statements will now be parsed with the traditional (non-AI) method"
          : "Bank statements will now be parsed with AI"
      );
    } catch {
      showToast("Failed to save — see console for details");
    } finally {
      setSavingExtractionMethod(false);
    }
  }

  async function handleRunDailyCheck() {
    setCheckingOverdue(true);
    try {
      const { remindersSent } = await runDailyCheck();
      showToast(
        remindersSent === 0
          ? "Daily check complete — nothing crossed a threshold today"
          : `Daily check complete — ${remindersSent} reminder${
              remindersSent === 1 ? "" : "s"
            } drafted and logged`
      );
    } catch {
      showToast("Daily check failed — see console for details");
    } finally {
      setCheckingOverdue(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure when reminders go out and preview what clients receive.
          </p>
        </div>
        <button
          onClick={handleRunDailyCheck}
          disabled={checkingOverdue}
          className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checkingOverdue ? "Running…" : "Run daily check"}
        </button>
      </div>

      <Card>
        <CardHeader
          title="Business"
          subtitle="Shown on receipt emails sent to your clients"
          action={
            <button
              onClick={handleSaveBusiness}
              disabled={!isBusinessDirty || savingBusiness}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {savingBusiness ? "Saving…" : "Save changes"}
            </button>
          }
        />
        <div className="flex flex-col gap-4 px-5 py-5">
          <LogoUploadField
            logoUrl={businessDraft.logoUrl}
            businessName={businessDraft.businessName ?? ""}
            onUploaded={(url) => setBusinessDraft((d) => ({ ...d, logoUrl: url }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Business name</span>
              <input
                value={businessDraft.businessName ?? ""}
                onChange={(e) => setBusinessDraft((d) => ({ ...d, businessName: e.target.value }))}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Business type</span>
              <select
                value={businessDraft.businessType ?? ""}
                onChange={(e) => setBusinessDraft((d) => ({ ...d, businessType: e.target.value }))}
                className="input"
              >
                <option value="">Select a type</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Business email</span>
              <input
                type="email"
                value={businessDraft.businessEmail ?? ""}
                onChange={(e) => setBusinessDraft((d) => ({ ...d, businessEmail: e.target.value }))}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Business phone</span>
              <input
                type="tel"
                value={businessDraft.businessPhone ?? ""}
                onChange={(e) => setBusinessDraft((d) => ({ ...d, businessPhone: e.target.value }))}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Country</span>
              <select
                value={businessDraft.country ?? ""}
                onChange={(e) => setBusinessDraft((d) => ({ ...d, country: e.target.value }))}
                className="input"
              >
                <option value="">Select a country</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Security" subtitle="Your password and sensitive-action settings" />
        <div className="divide-y divide-slate-100">
          <div className="px-5 py-5">
            <h4 className="text-sm font-medium text-slate-900">Change password</h4>
            <p className="mt-0.5 text-xs text-slate-500">Requires your current password.</p>
            <div className="mt-4 max-w-sm">
              <ChangePasswordForm />
            </div>
          </div>
          <div className="px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-slate-900">
                  Sensitive action confirmation
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  How often you need to re-confirm your password for sensitive actions
                </p>
              </div>
              <button
                onClick={handleSaveReconfirm}
                disabled={!isReconfirmDirty || !isReconfirmValid || savingReconfirm}
                className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {savingReconfirm ? "Saving…" : "Save changes"}
              </button>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Require password confirmation every
              </span>
              <div className="flex items-center gap-2">
                {/* Width belongs on this wrapper, not the input — .input's unlayered width:100% in globals.css always beats a Tailwind width utility placed directly on the element. */}
                <div className="w-24 flex-shrink-0">
                  <input
                    type="number"
                    min={PASSWORD_RECONFIRM_MIN_MINUTES}
                    max={PASSWORD_RECONFIRM_MAX_MINUTES}
                    value={reconfirmDraft}
                    onChange={(e) => setReconfirmDraft(Number(e.target.value))}
                    aria-invalid={!isReconfirmValid}
                    className="input"
                  />
                </div>
                <span className="text-xs text-slate-500">
                  minutes for sensitive actions ({PASSWORD_RECONFIRM_MIN_MINUTES}–
                  {PASSWORD_RECONFIRM_MAX_MINUTES})
                </span>
              </div>
              {!isReconfirmValid && (
                <p className="mt-1.5 text-xs text-red-600">
                  Enter a whole number between {PASSWORD_RECONFIRM_MIN_MINUTES} and{" "}
                  {PASSWORD_RECONFIRM_MAX_MINUTES}.
                </p>
              )}
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Payment receipts"
          subtitle="What happens when an invoice is marked paid in full"
        />
        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => handleSetSendReceiptImmediately(false)}
              disabled={savingReceiptSetting}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                !sendReceiptImmediately
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-900">Review before sending</p>
              <p className="mt-0.5 text-xs text-slate-500">
                A &quot;Send receipt&quot; action appears for you to trigger manually. Default.
              </p>
            </button>
            <button
              onClick={() => handleSetSendReceiptImmediately(true)}
              disabled={savingReceiptSetting}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                sendReceiptImmediately
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-900">Send receipt immediately</p>
              <p className="mt-0.5 text-xs text-slate-500">
                The receipt emails the client automatically the moment an invoice is paid.
              </p>
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Bank statement extraction"
          subtitle="How uploaded bank statements are parsed into transactions"
        />
        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => handleSetExtractionMethod("ai")}
              disabled={savingExtractionMethod}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                bankStatementExtractionMethod === "ai"
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-900">AI-powered (recommended)</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Uses Claude to read and structure your statement. Handles unusual formats and
                layout variations.
              </p>
            </button>
            <button
              onClick={() => handleSetExtractionMethod("traditional")}
              disabled={savingExtractionMethod}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                bankStatementExtractionMethod === "traditional"
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-900">Traditional (faster, no AI cost, less reliable)</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Uses pattern matching instead of AI. Faster and free, but may misread unusual
                formats or ambiguous transactions.
              </p>
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Reminder schedule"
          subtitle="Days after the due date when each stage triggers"
          action={
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Save changes
            </button>
          }
        />
        <div className="grid grid-cols-1 gap-6 px-5 py-5 sm:grid-cols-3">
          <ScheduleField
            label="Friendly reminder"
            hint="days after due date"
            value={draft.friendlyDays}
            onChange={(v) => setDraft((d) => ({ ...d, friendlyDays: v }))}
          />
          <ScheduleField
            label="Firm reminder"
            hint="days after due date"
            value={draft.firmDays}
            onChange={(v) => setDraft((d) => ({ ...d, firmDays: v }))}
          />
          <ScheduleField
            label="Final notice"
            hint="days after due date"
            value={draft.finalDays}
            onChange={(v) => setDraft((d) => ({ ...d, finalDays: v }))}
          />
        </div>
      </Card>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Final notice emails are drafted for your review — always read before sending. Avoid
        stating specific consequences (fees, collections, service suspension) unless they&apos;re
        actually part of your agreement with the client.
      </p>

      <Card>
        <CardHeader title="Reminder templates" subtitle="Sample email for each stage" />
        <div className="divide-y divide-slate-100">
          {STAGES.map(({ key, scheduleKey }) => {
            const meta = STAGE_META[key];
            const preview = getTemplatePreview(key, draft[scheduleKey]);
            const open = expandedStage === key;
            return (
              <div key={key}>
                <button
                  onClick={() => setExpandedStage(open ? null : key)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={meta.variant}>Day {draft[scheduleKey]}</Badge>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{meta.title}</p>
                      <p className="text-xs text-slate-500">{meta.description}</p>
                    </div>
                  </div>
                  <svg
                    className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${
                      open ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                    <p className="mb-3 text-xs text-slate-500">{preview.tone}</p>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="mb-3 border-b border-slate-100 pb-3 text-sm font-medium text-slate-900">
                        {preview.subject}
                      </p>
                      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
                        {preview.body}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ScheduleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        {/* Width belongs on this wrapper, not the input — .input's unlayered width:100% in globals.css always beats a Tailwind width utility placed directly on the element. */}
        <div className="w-24 flex-shrink-0">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
            className="input"
          />
        </div>
        <span className="text-xs text-slate-500">{hint}</span>
      </div>
    </label>
  );
}

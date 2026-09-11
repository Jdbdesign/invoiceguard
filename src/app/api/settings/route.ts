import { NextResponse } from "next/server";
import { mapSettings } from "@/lib/mappers";
import { getOrCreateSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  PASSWORD_RECONFIRM_MIN_MINUTES,
  PASSWORD_RECONFIRM_MAX_MINUTES,
} from "@/lib/passwordReconfirmBounds";
import { RECEIPT_TEMPLATES } from "@/lib/receiptTemplates";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getOrCreateSettings(session.user.id);
  return NextResponse.json(mapSettings(settings));
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const data: {
    friendlyReminderDays?: number;
    firmReminderDays?: number;
    finalNoticeDays?: number;
    passwordReconfirmMinutes?: number;
    sendReceiptImmediately?: boolean;
    activeReceiptTemplateId?: string;
    bankStatementExtractionMethod?: string;
    businessName?: string | null;
    businessType?: string | null;
    logoUrl?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    country?: string | null;
    onboardingCompletedAt?: Date;
  } = {};

  const hasSchedule =
    body.friendlyDays !== undefined ||
    body.firmDays !== undefined ||
    body.finalDays !== undefined;

  if (hasSchedule) {
    const friendlyDays = Number(body.friendlyDays);
    const firmDays = Number(body.firmDays);
    const finalDays = Number(body.finalDays);

    if (
      !Number.isFinite(friendlyDays) ||
      !Number.isFinite(firmDays) ||
      !Number.isFinite(finalDays) ||
      friendlyDays < 0 ||
      firmDays < 0 ||
      finalDays < 0
    ) {
      return NextResponse.json({ error: "invalid schedule" }, { status: 400 });
    }

    data.friendlyReminderDays = friendlyDays;
    data.firmReminderDays = firmDays;
    data.finalNoticeDays = finalDays;
  }

  if (body.passwordReconfirmMinutes !== undefined) {
    const passwordReconfirmMinutes = Number(body.passwordReconfirmMinutes);

    if (
      !Number.isInteger(passwordReconfirmMinutes) ||
      passwordReconfirmMinutes < PASSWORD_RECONFIRM_MIN_MINUTES ||
      passwordReconfirmMinutes > PASSWORD_RECONFIRM_MAX_MINUTES
    ) {
      return NextResponse.json(
        {
          error: `passwordReconfirmMinutes must be an integer between ${PASSWORD_RECONFIRM_MIN_MINUTES} and ${PASSWORD_RECONFIRM_MAX_MINUTES}`,
        },
        { status: 400 }
      );
    }

    data.passwordReconfirmMinutes = passwordReconfirmMinutes;
  }

  if (body.sendReceiptImmediately !== undefined) {
    data.sendReceiptImmediately = Boolean(body.sendReceiptImmediately);
  }

  if (body.activeReceiptTemplateId !== undefined) {
    const activeReceiptTemplateId = String(body.activeReceiptTemplateId);
    const isKnownTemplate = RECEIPT_TEMPLATES.some(
      (template) => template.id === activeReceiptTemplateId
    );

    if (!isKnownTemplate) {
      return NextResponse.json(
        { error: "activeReceiptTemplateId must match a known receipt template" },
        { status: 400 }
      );
    }

    data.activeReceiptTemplateId = activeReceiptTemplateId;
  }

  if (body.bankStatementExtractionMethod !== undefined) {
    const bankStatementExtractionMethod = String(body.bankStatementExtractionMethod);
    if (!["ai", "traditional"].includes(bankStatementExtractionMethod)) {
      return NextResponse.json(
        { error: "bankStatementExtractionMethod must be 'ai' or 'traditional'" },
        { status: 400 }
      );
    }
    data.bankStatementExtractionMethod = bankStatementExtractionMethod;
  }

  if (body.businessName !== undefined) {
    const businessName = String(body.businessName).trim();
    data.businessName = businessName.length > 0 ? businessName : null;
  }

  if (body.businessType !== undefined) {
    const businessType = String(body.businessType).trim();
    if (businessType.length > 0 && !BUSINESS_TYPES.includes(businessType as (typeof BUSINESS_TYPES)[number])) {
      return NextResponse.json(
        { error: "businessType must match a known business type" },
        { status: 400 }
      );
    }
    data.businessType = businessType.length > 0 ? businessType : null;
  }

  if (body.logoUrl !== undefined) {
    const logoUrl = body.logoUrl ? String(body.logoUrl).trim() : "";
    data.logoUrl = logoUrl.length > 0 ? logoUrl : null;
  }

  if (body.businessEmail !== undefined) {
    const businessEmail = body.businessEmail ? String(body.businessEmail).trim() : "";
    data.businessEmail = businessEmail.length > 0 ? businessEmail : null;
  }

  if (body.businessPhone !== undefined) {
    const businessPhone = body.businessPhone ? String(body.businessPhone).trim() : "";
    data.businessPhone = businessPhone.length > 0 ? businessPhone : null;
  }

  if (body.country !== undefined) {
    const country = body.country ? String(body.country).trim() : "";
    data.country = country.length > 0 ? country : null;
  }

  if (body.completeOnboarding === true) {
    data.onboardingCompletedAt = new Date();
  }

  await getOrCreateSettings(session.user.id);

  const updated = await prisma.settings.update({
    where: { ownerId: session.user.id },
    data,
  });

  return NextResponse.json(mapSettings(updated));
}

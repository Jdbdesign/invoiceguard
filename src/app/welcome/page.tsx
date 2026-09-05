import Link from "next/link";
import { auth } from "@/auth";
import { getOrCreateSettings } from "@/lib/settings";
import { WelcomeSkipNotice } from "@/components/onboarding/WelcomeSkipNotice";

export default async function WelcomePage() {
  const session = await auth();
  const settings = session?.user ? await getOrCreateSettings(session.user.id) : null;
  const businessName = settings?.businessName ?? "there";
  const showSkipNotice = !settings?.logoUrl;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#141414] px-6 py-12">
      <div className="w-full max-w-[440px]">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-white">
          You&apos;re all set, {businessName}
        </h1>
        <p className="mt-3 text-sm text-[#9A9A9A]">Here&apos;s a good place to start.</p>

        <div className="mt-8 flex flex-col gap-2">
          <ChecklistItem href="/clients" label="Add your first client" />
          <ChecklistItem href="/invoices" label="Create your first invoice" />
          <ChecklistItem href="/templates" label="Pick a receipt template" />
        </div>

        {showSkipNotice && <WelcomeSkipNotice />}

        <Link
          href="/"
          className="mt-8 block w-full rounded-xl bg-[#007ACC] px-4 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#0089E0]"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

function ChecklistItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-[#2C2C2C] bg-[#131313] px-4 py-3.5 text-sm text-white transition hover:border-[#007ACC]"
    >
      <span>{label}</span>
      <span aria-hidden className="text-[#6E6E6E]">
        →
      </span>
    </Link>
  );
}

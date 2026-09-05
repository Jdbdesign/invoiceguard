import type { ReactNode } from "react";
import { AuthCarousel } from "./AuthCarousel";

/** Shared field styling for the auth pages — dark, recessed, #007ACC focus ring. */
export const authInputClass =
  "w-full rounded-xl border border-[#2C2C2C] bg-[#131313] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-[#6E6E6E] focus:border-[#007ACC] focus:ring-1 focus:ring-[#007ACC]";

/**
 * Applied to the wrapper around <PasswordInput /> so the auth pages can restyle
 * that shared component without changing it (it is also used by the in-app
 * password confirm modal). The descendant selectors out-specify the component's
 * own single-class utilities.
 */
export const authPasswordFieldClass =
  "[&_button]:text-[#6E6E6E] [&_button]:hover:text-[#B4B4B4] [&_input]:w-full [&_input]:rounded-xl [&_input]:border-[#2C2C2C] [&_input]:bg-[#131313] [&_input]:px-4 [&_input]:py-3.5 [&_input]:pr-12 [&_input]:text-sm [&_input]:text-white [&_input]:placeholder:text-[#6E6E6E] [&_input]:focus:border-[#007ACC] [&_input]:focus:ring-1 [&_input]:focus:ring-[#007ACC]";

/** Primary submit button — the brand accent. */
export const authButtonClass =
  "w-full rounded-xl bg-[#007ACC] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0089E0] disabled:cursor-not-allowed disabled:opacity-60";

/** Accent link. */
export const authLinkClass = "font-medium text-[#007ACC] transition hover:text-[#3DA3E0]";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#141414] lg:p-6">
      {/* One card, two halves — only the card's outer corners are rounded. */}
      <div className="flex min-h-dvh flex-col overflow-hidden bg-[#181818] lg:min-h-[calc(100dvh-3rem)] lg:flex-row lg:rounded-[24px]">
        {/* The roomier spacing scale is gated on viewport HEIGHT, not width —
            height is what runs out first on short desktop screens. */}
        <aside className="hidden w-1/2 flex-col bg-[#1C1C1C] px-8 py-8 lg:flex xl:px-12 [@media(min-height:850px)]:py-10">
          {/* In normal flow, not absolute — the logo owns this row so the
              centered carousel below can never grow into it. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative static SVG, no next/image usage elsewhere in this repo */}
          <img
            src="/auth/logo.svg"
            alt="Remitrak"
            className="h-6 w-auto shrink-0 self-start [@media(min-height:850px)]:h-7"
          />

          <div className="flex min-h-0 flex-1 items-center justify-center pt-6">
            <AuthCarousel />
          </div>
        </aside>

        <main className="flex w-full flex-1 items-center justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-12 xl:px-16 [@media(min-height:850px)]:py-16">
          <div className="w-full max-w-[400px]">
            {/* Mobile/tablet only — below lg: the aside (and its logo) is hidden,
                so this is the only branding on the page at that size. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative static SVG, no next/image usage elsewhere in this repo */}
            <img src="/auth/logo.svg" alt="Remitrak" className="mb-8 h-6 w-auto lg:hidden" />

            <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-white">
              {title}
            </h1>
            <p className="mt-3 text-sm text-[#9A9A9A]">{subtitle}</p>

            <div className="mt-10">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

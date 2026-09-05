"use client";

import { useEffect, useState } from "react";

const SLIDES = [
  {
    src: "/auth/slide-1.svg",
    alt: "Illustration of invoicing and payment tracking",
    caption: ["Invoices Sent,", "Payments Tracked"],
  },
  {
    src: "/auth/slide-2.svg",
    alt: "Illustration of automated payment reminders",
    caption: ["Reminders on Autopilot,", "Cash Flow on Time"],
  },
  {
    src: "/auth/slide-3.svg",
    alt: "Illustration of client and invoice overview",
    caption: ["Every Client, Every Payment,", "One Clear View"],
  },
];

const ROTATION_MS = 5000;

export function AuthCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div className="flex w-full flex-col items-center">
      {/* Sized against panel width AND viewport height so the stack below it
          (caption + dots) always stays on screen at short desktop heights. */}
      <div className="relative aspect-square w-[min(86%,620px,57vh)]">
        {SLIDES.map((slide, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- decorative static SVG, no next/image usage elsewhere in this repo
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-[250ms] ${
              index === active ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-[26px] font-semibold leading-snug tracking-tight text-white [@media(min-height:850px)]:mt-12 [@media(min-height:850px)]:text-[32px]">
        {SLIDES[active].caption[0]}
        <br />
        {SLIDES[active].caption[1]}
      </p>

      <div className="mt-6 flex items-center justify-center gap-2 [@media(min-height:850px)]:mt-8">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`Show slide ${index + 1}`}
            aria-current={index === active}
            className={`h-1.5 rounded-full transition-all ${
              index === active ? "w-7 bg-white" : "w-1.5 bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

// Matches the email templates' own `Container` width (see PaymentReceiptEmail
// and PaymentReceiptIndigoEmail) — the standard fixed width email clients render at.
const NATIVE_WIDTH = 600;

// An iframe with srcDoc isolates the email's own inline styles (Tailwind
// classes get inlined by react-email's render()) from the app shell's
// styles — the same reason react-email's own dev preview server uses one.
//
// The iframe always renders at NATIVE_WIDTH so the layout matches exactly
// what a real email client shows — the templates use react-email's Row/Column,
// which emit HTML tables that cramp or clip rather than reflow cleanly at
// arbitrary widths. To fit narrower grid cards, the rendered iframe is then
// visually shrunk with a CSS transform instead of being reflowed narrower.
export function TemplatePreviewFrame({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / NATIVE_WIDTH));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const resize = () => {
      const doc = frame.contentDocument;
      if (doc?.body) setFrameHeight(doc.body.scrollHeight);
    };
    // srcDoc content can finish loading synchronously, before this effect
    // gets a chance to attach the listener — catch that case directly
    // instead of missing the load event entirely.
    if (frame.contentDocument?.readyState === "complete") resize();
    frame.addEventListener("load", resize);
    return () => frame.removeEventListener("load", resize);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
      style={{ height: frameHeight * scale || undefined }}
    >
      <iframe
        ref={frameRef}
        srcDoc={html}
        title="Receipt email preview"
        style={{
          width: NATIVE_WIDTH,
          height: frameHeight || 640,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: 0,
          display: "block",
        }}
      />
    </div>
  );
}

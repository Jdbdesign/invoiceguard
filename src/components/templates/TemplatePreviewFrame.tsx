"use client";

import { useEffect, useRef } from "react";

// An iframe with srcDoc isolates the email's own inline styles (Tailwind
// classes get inlined by react-email's render()) from the app shell's
// styles — the same reason react-email's own dev preview server uses one.
export function TemplatePreviewFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const resize = () => {
      const doc = frame.contentDocument;
      if (doc?.body) frame.style.height = `${doc.body.scrollHeight}px`;
    };
    frame.addEventListener("load", resize);
    return () => frame.removeEventListener("load", resize);
  }, []);

  return (
    <iframe
      ref={ref}
      srcDoc={html}
      title="Receipt email preview"
      className="w-full rounded-lg border border-slate-200 bg-white"
      style={{ height: 640 }}
    />
  );
}

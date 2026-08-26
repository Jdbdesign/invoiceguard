"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function RowActionsMenu({
  onEdit,
  onDelete,
  onCreatePaymentPlan,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onCreatePaymentPlan?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasCreatePaymentPlan = Boolean(onCreatePaymentPlan);

  useEffect(() => {
    if (!open) return;

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function closeMenu() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onClickOutside);
    // `capture: true` so this also fires for scrolls inside any nested
    // scroll container (e.g. a table body), not just window-level scroll.
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [open]);

  // Position the portaled menu from the trigger button's live bounding
  // rect, flipping it above the button when there isn't enough viewport
  // space below. Measured against the menu's own rendered height (not a
  // guessed constant) so it stays correct as items are added/removed.
  // Runs in a layout effect so the flip is resolved before the browser
  // paints — no visible jump from "opens down" to "opens up".
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const margin = 4;
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const openUpward =
      spaceBelow < menuRect.height + margin && buttonRect.top > menuRect.height + margin;

    setPosition({
      left: buttonRect.right - menuRect.width,
      top: openUpward
        ? buttonRect.top - menuRect.height - margin
        : buttonRect.bottom + margin,
    });
  }, [open, hasCreatePaymentPlan]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Row actions"
        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
            }}
            className="z-20 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onEdit();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              Edit
            </button>
            {onCreatePaymentPlan && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onCreatePaymentPlan();
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                Create payment plan
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDelete();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
            >
              Delete
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

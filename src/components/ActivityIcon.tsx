import type { ActivityType } from "@/lib/types";

export function activityIconVariant(type: ActivityType): string {
  switch (type) {
    case "payment_received":
    case "installment_paid":
      return "bg-emerald-50 text-emerald-600";
    case "client_reply":
      return "bg-blue-50 text-blue-600";
    case "plan_created":
      return "bg-indigo-50 text-indigo-600";
    case "receipt_sent":
      return "bg-teal-50 text-teal-600";
    case "reminder_sent":
    default:
      return "bg-amber-50 text-amber-600";
  }
}

export function ActivityIcon({
  type,
  className,
}: {
  type: ActivityType;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    strokeWidth: 2,
    stroke: "currentColor",
    className,
  };

  switch (type) {
    case "payment_received":
    case "installment_paid":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      );
    case "client_reply":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h8M8 14h4.5M21 12c0 4.556-4.03 8.25-9 8.25a9.7 9.7 0 01-3.16-.524L3 21l1.396-3.72C3.512 15.933 3 14.026 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
      );
    case "plan_created":
      return (
        <svg {...common}>
          <rect x="4" y="4.5" width="16" height="15" rx="1.5" />
          <path strokeLinecap="round" d="M8 3v3M16 3v3M4 9.5h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l2 2 4-4" />
        </svg>
      );
    case "receipt_sent":
      return (
        <svg {...common}>
          <path d="M6 3.5h12v17l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5-2-1.5v-15z" />
          <path strokeLinecap="round" d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
        </svg>
      );
    case "reminder_sent":
    default:
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 6.75l9 6 9-6M4.5 5.25h15a1.5 1.5 0 011.5 1.5v10.5a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5V6.75a1.5 1.5 0 011.5-1.5z"
          />
        </svg>
      );
  }
}

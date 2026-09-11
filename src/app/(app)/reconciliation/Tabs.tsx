"use client";

import { Badge } from "@/components/ui/Badge";

export interface TabItem {
  id: string;
  label: string;
  count: number;
}

export function Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700"
            }`}
          >
            {tab.label}
            <Badge variant={active ? "info" : "neutral"}>{tab.count}</Badge>
          </button>
        );
      })}
    </div>
  );
}

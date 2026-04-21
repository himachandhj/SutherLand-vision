"use client";

import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "../ui/badge";

function SummaryChip({ label, value, tone = "default" }) {
  const toneClasses =
    tone === "accent"
      ? "border-brandBlue/20 bg-brandBlue/[0.05] text-brandBlue"
      : tone === "warm"
        ? "border-brandRed/20 bg-brandRed/[0.05] text-slate-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClasses}`}>
      <span className="uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </span>
  );
}

export default function WorkflowPanel({
  stepNumber,
  title,
  subtitle,
  statusLabel,
  statusTone = "normal",
  summaryItems = [],
  isOpen,
  onToggle,
  headerAction,
  children,
}) {
  return (
    <section className={`overflow-hidden rounded-[28px] border bg-white shadow-panel transition ${isOpen ? "border-brandBlue/20" : "border-slate-200"}`}>
      <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
        <button className="flex min-w-0 flex-1 items-start gap-4 text-left" onClick={onToggle} type="button">
          <span
            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
              isOpen ? "bg-brandBlue text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {stepNumber}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
              {statusLabel ? <Badge tone={statusTone}>{statusLabel}</Badge> : null}
            </div>
            {subtitle ? <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
            {summaryItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {summaryItems.map((item) => (
                  <SummaryChip key={`${title}-${item.label}-${item.value}`} label={item.label} tone={item.tone} value={item.value} />
                ))}
              </div>
            ) : null}
          </div>
          <span className="mt-1 hidden rounded-full border border-slate-200 bg-white p-2 text-slate-400 lg:inline-flex">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      {isOpen ? <div className="border-t border-slate-200 px-5 py-5 lg:px-6">{children}</div> : null}
    </section>
  );
}

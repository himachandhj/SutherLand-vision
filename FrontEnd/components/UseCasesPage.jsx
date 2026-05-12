"use client";

import Image from "next/image";

import BrandHeader from "./BrandHeader";
import { categoryDetails, visibleUseCases } from "./visionLabConfig";

function isVisibleCategory(section) {
  return String(section?.label || "").trim().toLowerCase() !== "customer experience";
}

function isVisibleUseCase(item) {
  const category = String(item?.category || "").trim().toLowerCase();
  const combinedText = `${item?.id || ""} ${item?.title || ""} ${item?.description || ""} ${item?.currentDescription || ""} ${item?.extensionDescription || ""}`.toLowerCase();
  if (category === "customer experience") return false;
  return !combinedText.includes("queue management");
}

function getPresentationTitle(item) {
  if (item?.cardTitle) return item.cardTitle;
  return String(item?.title || "").replace(/\bSutherland Hub\b|\bSouthernland Hub\b|\bSoutherntherland Hub\b|\bSutherland V Hub\b/gi, "Sutherland Vision Hub");
}

function VerticalChip({ label, tone = "available" }) {
  const toneClasses = tone === "available"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
  const dotClasses = tone === "available" ? "bg-emerald-500" : "bg-rose-400";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClasses}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} />
      <span>{label}</span>
    </span>
  );
}

function VerticalGroup({ tone, values }) {
  if (!Array.isArray(values) || values.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <VerticalChip key={`${tone}-${value}`} label={value} tone={tone} />
      ))}
    </div>
  );
}

function SidebarLink({ active = false, label, onClick }) {
  return (
    <button
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${active ? "border-brandBlue bg-brandBlue text-white" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"}`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      {active && <span className="h-2 w-2 rounded-full bg-brandRed" />}
    </button>
  );
}

function UseCaseCard({ item, onClick }) {
  return (
    <button
      className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-panel transition hover:-translate-y-1 hover:border-brandBlue/35"
      onClick={onClick}
      type="button"
    >
      <div className="relative h-48 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <Image
          alt={`${item.title} use case preview`}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          fill
          priority={item.id === "ppe-detection"}
          sizes="(min-width: 1280px) 28vw, 100vw"
          src={item.image}
        />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.accent }} />
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.category}</div>
      </div>
      <h2 className="mt-3 text-xl font-semibold text-slate-900">{getPresentationTitle(item)}</h2>
      <p className="mt-2 min-h-[2.5rem] text-sm leading-5 text-slate-600">{item.cardSummary || item.description}</p>
      <div className="mt-4 space-y-3">
        <VerticalGroup tone="available" values={item.cardAvailableVerticals} />
        <VerticalGroup tone="extendable" values={item.cardExtendableVerticals} />
      </div>
    </button>
  );
}

export default function UseCasesPage({ activeSection, onChangeSection, onGoHome, onOpenUseCase }) {
  const visibleCategories = categoryDetails.filter(isVisibleCategory);
  const visibleCards = visibleUseCases.filter(isVisibleUseCase);
  const resolvedActiveSection = visibleCategories.some((section) => section.label === activeSection)
    ? activeSection
    : visibleCategories[0]?.label ?? activeSection;
  const filteredUseCases = visibleCards.filter((item) => item.category === resolvedActiveSection);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-10 py-6">
        <BrandHeader onHomeClick={onGoHome} />
      </header>
      <div className="flex min-h-[calc(100vh-96px)] bg-white">
        <aside className="w-72 border-r border-slate-200 bg-white px-8 py-10">
          <nav className="space-y-2">
            {visibleCategories.map((section) => (
              <SidebarLink key={section.param} active={resolvedActiveSection === section.label} label={section.label} onClick={() => onChangeSection(section.label)} />
            ))}
          </nav>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Use Cases</div>
            <div className="mt-2 text-3xl font-semibold text-brandBlue">{visibleCards.length}</div>
            <div className="mt-1 text-xs text-slate-400">{visibleCategories.length} categories</div>
          </div>
        </aside>

        <main className="flex-1 px-10 py-10">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">Operational vision use cases</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{resolvedActiveSection}</h1>
            <p className="mt-2 text-sm text-slate-500">{filteredUseCases.length} use case{filteredUseCases.length !== 1 ? "s" : ""} in this category</p>
          </div>
          <div className={`grid gap-6 ${filteredUseCases.length === 1 ? "grid-cols-1 max-w-xl" : filteredUseCases.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {filteredUseCases.map((item) => (
              <UseCaseCard key={item.id} item={item} onClick={() => onOpenUseCase(item.id, item.category)} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

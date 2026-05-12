"use client";

import Image from "next/image";

import BrandHeader from "./BrandHeader";
import { categoryDetails } from "./visionLabConfig";

function isVisibleCategory(category) {
  const label = String(category?.label || "").trim().toLowerCase();
  return label !== "customer experience";
}

function getPresentationDescription(text) {
  return String(text || "")
    .replace(/\bplant\s*floors\b/gi, "warehouses, restricted areas, and industrial facilities")
    .replace(/\bplantfloors\b/gi, "warehouses, restricted areas, and industrial facilities")
    .replace(/\bSutherland Hub\b|\bSouthernland Hub\b|\bSoutherntherland Hub\b|\bSutherland V Hub\b/gi, "Sutherland Vision Hub");
}

export default function LandingPage({ onExploreSection }) {
  const visibleCategories = categoryDetails.filter(isVisibleCategory);
  const primaryCategories = visibleCategories.slice(0, 3);
  const secondaryCategories = visibleCategories.slice(3);

  return (
    <div className="bg-white">
      <header className="px-6 py-8 md:px-10">
        <BrandHeader onHomeClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
      </header>
      <main className="px-6 pb-16 md:px-10">
        <section className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">Enterprise AI Vision</p>
          <h1 className="mt-5 text-6xl font-semibold tracking-tight text-slate-900">Turning Enterprise Videos into Vision Intelligence</h1>
          <p className="mx-auto mt-6 max-w-3xl text-xl leading-9 text-slate-500">
            Explore active vision use cases across safety, surveillance, traffic intelligence, defect monitoring, and
            many more.
          </p>
        </section>

        <section className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-panel">
          <video
            autoPlay
            className="h-[34rem] w-full object-cover"
            controls
            loop
            muted
            playsInline
            src="/videos/PPE_mainpage.webm"
          >
            Your browser does not support the video tag.
          </video>
        </section>
        <section className="mx-auto mt-20 max-w-6xl">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">Explore Categories</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Enterprise vision use cases by category</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {primaryCategories.map((category) => (
              <button
                key={category.param}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-panel transition hover:-translate-y-1 hover:border-brandBlue/35"
                onClick={() => onExploreSection(category.label)}
                type="button"
              >
                <div className="relative h-64 overflow-hidden bg-slate-100">
                  <Image alt={category.label} className="h-full w-full object-cover" fill sizes="(min-width: 1280px) 30vw, 100vw" src={category.image} />
                </div>
                <div className="p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brandRed">{category.label}</div>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">{category.label}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-500">{getPresentationDescription(category.description)}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {secondaryCategories.map((category) => (
              <button
                key={category.param}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-panel transition hover:-translate-y-1 hover:border-brandBlue/35"
                onClick={() => onExploreSection(category.label)}
                type="button"
              >
                <div className="relative h-48 overflow-hidden bg-slate-100">
                  <Image alt={category.label} className="h-full w-full object-cover" fill sizes="(min-width: 1280px) 45vw, 100vw" src={category.image} />
                </div>
                <div className="p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brandRed">{category.label}</div>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">{category.label}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-500">{getPresentationDescription(category.description)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
      <footer className="w-full bg-[#090824]">
        <img
          src="/images/sutherland-footer.png"
          alt="Sutherland footer"
          className="block h-auto w-full"
        />
      </footer>
    </div>
  );
}

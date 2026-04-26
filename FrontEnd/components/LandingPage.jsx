"use client";

import Image from "next/image";

import BrandHeader from "./BrandHeader";
import { API_BASE_URL, BRAND_RED, categoryDetails, useCases } from "./visionLabConfig";

export default function LandingPage({ onExploreSection }) {
  return (
    <div className="bg-white">
      <header className="px-10 py-8">
        <BrandHeader onHomeClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
      </header>
      <main className="px-10 pb-16">
        <section className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">Enterprise AI Vision</p>
          <h1 className="mt-5 text-6xl font-semibold tracking-tight text-slate-900">
            Transforming enterprise video into actionable intelligence.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-xl leading-9 text-slate-500">
            Sutherland Hub brings together enterprise-grade computer vision workflows for workplace safety,
            retail intelligence, healthcare, security, and smart city operations.
          </p>
        </section>

        <section className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-panel">
          <video autoPlay className="h-[34rem] w-full object-cover" controls loop muted playsInline src={`${API_BASE_URL}/static/PPE_VIDEO1.mp4`} />
        </section>
        <section className="mx-auto mt-20 max-w-6xl">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">Explore Categories</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Enterprise vision use cases by domain</h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {categoryDetails.slice(0, 3).map((category) => (
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
                  <p className="mt-4 text-sm leading-7 text-slate-500">{category.description}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6">
            {categoryDetails.slice(3).map((category) => (
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
                  <p className="mt-4 text-sm leading-7 text-slate-500">{category.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

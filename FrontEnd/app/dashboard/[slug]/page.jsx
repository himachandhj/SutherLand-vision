import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardPage } from "../../../components/dashboard/dashboard-page";
import { dashboardData, dashboardInfo } from "../../../components/dashboard/mock-data";

export default function DashboardRoute({ params }) {
  const slug = params.slug;
  if (slug === "object-counting") {
    redirect("/dashboard/ppe-detection");
  }

  const usesLiveRows = slug === "ppe-detection" || slug === "fire-detection" || slug === "region-alerts" || slug === "speed-estimation" || slug === "crack-detection" || slug === "unsafe-behavior-detection";
  const rows = usesLiveRows ? [] : dashboardData[slug];
  const info = dashboardInfo[slug];

  if (!rows || !info) {
    return (
      <div className="min-h-screen bg-surface px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl rounded-2xl border border-borderSoft bg-white p-8 shadow-card">
          <h1 className="text-2xl font-semibold text-brandBlue">Dashboard not found</h1>
          <p className="mt-2 text-sm text-muted">The requested dashboard slug <span className="font-mono">{String(slug)}</span> does not exist.</p>
          <div className="mt-6 flex gap-3">
            <Link className="rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-red-light" href="/dashboard/ppe-detection">
              Go to PPE Dashboard
            </Link>
            <Link className="rounded-lg border border-brand-blue px-4 py-2.5 text-sm font-semibold text-brand-blue hover:bg-brand-blue-tint" href="/dashboard">
              Dashboard Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardPage
      slug={slug}
      title={info}
      description={info}
      rows={rows}
    />
  );
}

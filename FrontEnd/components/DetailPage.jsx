"use client";

import BrandHeader from "./BrandHeader";
import FineTuning from "./FineTuning";
import Integration from "./Integration";
import ModelPlayground from "./ModelPlayground";
import { tabs } from "./visionLabConfig";

export default function DetailPage({
  activeTab,
  activeUseCase,
  onBack,
  onGoHome,
  onProcessInput,
  playgroundState,
  selectedSample,
  sampleMedia,
  setActiveTab,
  integrationForm,
  integrationOverview,
  integrationError,
  isConnectingIntegration,
  integrationMode,
  integrationFetchCount,
  integrationFetchedVideos,
  selectedIntegrationVideos,
  isFetchingIntegrationVideos,
  isProcessingIntegrationVideos,
  integrationFetchMessage,
  integrationProcessMessage,
  expandedRunId,
  onIntegrationFieldChange,
  onIntegrationConnect,
  onIntegrationModeChange,
  onIntegrationFetchCountChange,
  onIntegrationFetchVideos,
  onIntegrationSelectionChange,
  onIntegrationProcessSelected,
  onToggleRunAnalysis,
  onOpenAnalyticsDashboard,
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white px-10 py-6">
        <BrandHeader onHomeClick={onGoHome} />
        <div className="mt-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <button className="hover:text-brandBlue" onClick={onGoHome}>Home</button>
            <span>/</span>
            <button className="hover:text-brandBlue" onClick={onBack}>{activeUseCase.category}</button>
            <span>/</span>
            <span className="font-medium text-slate-900">{activeUseCase.title}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{activeUseCase.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{activeUseCase.description}</p>
        </div>
      </header>

      <div className="px-10 pt-6">
        <div className="mb-8 flex gap-3 border-b border-slate-200">
          {tabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${active ? "border-brandRed text-brandBlue" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                onClick={() => {
                  if (tab === "Dashboard") {
                    onOpenAnalyticsDashboard?.();
                    return;
                  }
                  setActiveTab(tab);
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {activeTab === "Model Playground" && (
          <ModelPlayground activeUseCase={activeUseCase} onProcessInput={onProcessInput} playgroundState={playgroundState} selectedSample={selectedSample} sampleMedia={sampleMedia} />
        )}
        {activeTab === "Integration" && (
          <Integration
            activeUseCase={activeUseCase}
            integrationForm={integrationForm}
            integrationOverview={integrationOverview}
            integrationError={integrationError}
            isConnectingIntegration={isConnectingIntegration}
            integrationMode={integrationMode}
            integrationFetchCount={integrationFetchCount}
            integrationFetchedVideos={integrationFetchedVideos}
            selectedIntegrationVideos={selectedIntegrationVideos}
            isFetchingIntegrationVideos={isFetchingIntegrationVideos}
            isProcessingIntegrationVideos={isProcessingIntegrationVideos}
            integrationFetchMessage={integrationFetchMessage}
            integrationProcessMessage={integrationProcessMessage}
            expandedRunId={expandedRunId}
            onIntegrationFieldChange={onIntegrationFieldChange}
            onIntegrationConnect={onIntegrationConnect}
            onIntegrationModeChange={onIntegrationModeChange}
            onIntegrationFetchCountChange={onIntegrationFetchCountChange}
            onIntegrationFetchVideos={onIntegrationFetchVideos}
            onIntegrationSelectionChange={onIntegrationSelectionChange}
            onIntegrationProcessSelected={onIntegrationProcessSelected}
            onToggleRunAnalysis={onToggleRunAnalysis}
          />
        )}
        {activeTab === "Fine-Tuning" && <FineTuning activeUseCase={activeUseCase} />}
        {activeTab === "Dashboard" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Redirecting to the analytics dashboard…
          </div>
        )}
      </div>
    </div>
  );
}

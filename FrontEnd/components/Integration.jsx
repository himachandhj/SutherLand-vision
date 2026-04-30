"use client";

import { Fragment } from "react";

import { integrationSupportedUseCases, resolveBackendUrl } from "./visionLabConfig";

function integrationStatusClasses(status) {
  if (status === "completed") return "border-green-200 bg-green-50 text-green-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "processing" || status === "queued") return "border-brandBlue/15 bg-brandBlue/[0.03] text-brandBlue";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatIntegrationStatus(status) {
  return (status || "available").replaceAll("_", " ");
}

function formatIntegrationBytes(size) {
  if (!size) return "0 MB";
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatIntegrationTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatAnalysisLabel(key) {
  return (key || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAnalysisValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RunAnalysisPanel({ run }) {
  const entries = Object.entries(run.metrics ?? {});
  const fallbackUsed = Boolean(run.metrics?.fallback_used);
  const fallbackReason = run.metrics?.fallback_reason;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Output Analysis</h4>
          <p className="mt-1 text-sm text-slate-500">Latest analysis metadata captured for this {run.use_case_id.replaceAll("-", " ")} run.</p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Run #{run.id}</div>
      </div>
      {fallbackUsed ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {fallbackReason || "Staged model was not compatible or produced no valid detections, so the current/default model was used for this run."}
        </div>
      ) : null}
      {entries.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No analysis metadata was stored for this run.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{formatAnalysisLabel(key)}</div>
              <div className="mt-2 break-words text-sm font-medium text-slate-800">{formatAnalysisValue(value)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 text-xs text-slate-400">
        {run.message || "No additional run note available."}
      </div>
    </div>
  );
}

function IntegrationField({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function StorageProviderCard({ title, subtitle, active }) {
  return (
    <div className={`rounded-2xl border p-4 transition ${active ? "border-brandBlue bg-brandBlue/[0.03]" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${active ? "bg-brandBlue text-white" : "bg-white text-slate-400"}`}>
          {active ? "Active" : "Soon"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}

function IntegrationMetricCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-brandBlue">{value}</div>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function IntegrationModeButton({ active, label, onClick }) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        active ? "bg-brandBlue text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brandBlue/40 hover:text-brandBlue"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function formatModelModeLabel(mode) {
  return mode === "staging" ? "Staged fine-tuned model" : "Current active model";
}

function formatModelUsageLabel(modeUsed) {
  if (modeUsed === "staging") return "Staged fine-tuned model";
  if (modeUsed === "active") return "Current active model";
  return "Current active/default model";
}

function IntegrationModelModeControl({
  connection,
  disabled,
  helperText,
  label,
  modelState,
  selectedMode,
  onChange,
}) {
  const showStagedOption = Boolean(modelState?.has_staged_model);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
        <select
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          disabled={disabled}
          value={selectedMode}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="active">Current active model</option>
          {showStagedOption ? <option value="staging">Staged fine-tuned model</option> : null}
        </select>
      </label>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {showStagedOption
          ? helperText
          : "Stage a fine-tuned model from Go Live Safely to test it here."}
      </p>
      {connection?.model_path_used ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
          <div className="font-semibold uppercase tracking-[0.18em] text-slate-400">Current backend model</div>
          <div className="mt-2 text-sm font-medium text-slate-700">{formatModelUsageLabel(connection.model_mode_used)}</div>
          <div className="mt-1 break-all">{connection.model_path_used}</div>
          {connection.fallback_used && connection.fallback_reason ? (
            <div className="mt-2 text-amber-700">{connection.fallback_reason}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IntegrationAutoPanel({
  connection,
  isConnected,
  isProcessing,
  modelState,
  selectedModelMode,
  useCaseLabel,
  onModelModeChange,
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Auto Mode Monitor</h3>
          <p className="mt-1 text-sm text-slate-500">
            Auto mode monitors the connected MinIO <strong>{connection?.input_prefix ?? "input/"}</strong> prefix for new or unprocessed <strong>{useCaseLabel}</strong> videos and processes them one by one into <strong>{connection?.output_prefix ?? "output/"}</strong>.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(isProcessing ? "processing" : isConnected ? "available" : "failed")}`}>
          {isProcessing ? "Monitoring • Active" : isConnected ? "Monitoring • Idle" : "Not Connected"}
        </span>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <IntegrationModelModeControl
          connection={connection}
          disabled={!isConnected}
          helperText="Choose whether this auto-processing session should use the current active model or the staged fine-tuned model."
          label="Auto mode model"
          modelState={modelState}
          selectedMode={selectedModelMode}
          onChange={onModelModeChange}
        />
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Input Source</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{connection?.bucket ?? "—"}</div>
          <div className="mt-1 text-xs text-slate-500">{connection?.input_prefix ?? "input/"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Detection Rule</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">New or Unprocessed Videos</div>
          <div className="mt-1 text-xs text-slate-500">Already completed videos are skipped on later polls.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Output Target</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{connection?.bucket ?? "—"}</div>
          <div className="mt-1 text-xs text-slate-500">{connection?.output_prefix ?? "output/"}</div>
        </div>
      </div>
    </section>
  );
}

function IntegrationManualPanel({
  connection,
  disabled,
  fetchCount,
  fetchedVideos,
  isFetching,
  modelState,
  isProcessing,
  fetchMessage,
  processMessage,
  selectedModelMode,
  selectedVideos,
  useCaseLabel,
  onModelModeChange,
  onFetchCountChange,
  onFetchVideos,
  onProcessSelected,
  onSelectionChange,
}) {
  const selectableVideos = fetchedVideos.filter((video) => !["completed", "processing"].includes(video.status));
  const allSelectableSelected = selectableVideos.length > 0 && selectableVideos.every((video) => selectedVideos.includes(video.object_key));

  const toggleVideo = (objectKey) => {
    onSelectionChange(
      selectedVideos.includes(objectKey)
        ? selectedVideos.filter((key) => key !== objectKey)
        : [...selectedVideos, objectKey],
    );
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      onSelectionChange(selectedVideos.filter((key) => !selectableVideos.some((video) => video.object_key === key)));
      return;
    }
    const next = new Set(selectedVideos);
    selectableVideos.forEach((video) => next.add(video.object_key));
    onSelectionChange(Array.from(next));
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Manual Fetch & Process</h3>
          <p className="mt-1 text-sm text-slate-500">
            Fetch videos from the connected MinIO <strong>{connection?.input_prefix ?? "input/"}</strong> prefix, choose the {useCaseLabel} inputs you want, and process only those selections.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Target bucket: <strong className="text-slate-700">{connection?.bucket ?? "Not connected"}</strong>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
          <IntegrationModelModeControl
            connection={connection}
            disabled={disabled || isProcessing}
            helperText="Choose which model should be used only for the selected manual video run."
            label="Model for this run"
            modelState={modelState}
            selectedMode={selectedModelMode}
            onChange={onModelModeChange}
          />
          <div className="flex flex-col gap-4 lg:justify-between">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold text-slate-700" htmlFor="integration-fetch-count">Fetch count</label>
                <select
                  id="integration-fetch-count"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  disabled={disabled || isFetching}
                  value={fetchCount}
                  onChange={(event) => onFetchCountChange(Number(event.target.value))}
                >
                  {[5, 10, 20, 50].map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
                <button className="rounded-xl border border-brandBlue px-5 py-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlue hover:text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled || isFetching} onClick={onFetchVideos} type="button">
                  {isFetching ? "Fetching..." : "Fetch Videos"}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-brandBlue hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-60" disabled={selectableVideos.length === 0} onClick={toggleSelectAll} type="button">
                  {allSelectableSelected ? "Clear Selection" : "Select All"}
                </button>
                <button className="rounded-xl bg-brandBlue px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled || isProcessing || selectedVideos.length === 0} onClick={onProcessSelected} type="button">
                  {isProcessing ? "Processing..." : `Process Selected${selectedVideos.length > 0 ? ` (${selectedVideos.length})` : ""}`}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Processed using: <strong className="text-slate-800">{formatModelModeLabel(selectedModelMode)}</strong>
            </div>
          </div>
        </div>
      </div>
      {fetchMessage && (
        <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm font-medium ${fetchMessage.startsWith("✗") ? "border-red-200 bg-red-50 text-red-700" : "border-brandBlue/15 bg-brandBlue/[0.03] text-slate-700"}`}>
          {fetchMessage}
        </div>
      )}
      {processMessage && (
        <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm font-medium ${processMessage.startsWith("✗") ? "border-red-200 bg-red-50 text-red-700" : "border-brandBlue/15 bg-brandBlue/[0.03] text-slate-700"}`}>
          {processMessage}
        </div>
      )}
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        {fetchedVideos.length === 0 ? (
          <div className="bg-white px-4 py-10 text-center text-sm text-slate-500">
            Fetch videos to list the current {useCaseLabel} inputs from MinIO.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Video</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Updated</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {fetchedVideos.map((video) => {
                const selectable = !["completed", "processing"].includes(video.status);
                return (
                  <tr key={video.object_key} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <input
                        checked={selectedVideos.includes(video.object_key)}
                        className="h-4 w-4 rounded border-slate-300 text-brandBlue focus:ring-brandBlue"
                        disabled={!selectable}
                        type="checkbox"
                        onChange={() => toggleVideo(video.object_key)}
                      />
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <div className="font-medium text-slate-800">{video.name}</div>
                      <div className="mt-1 break-all text-xs text-slate-500">{video.object_key}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(video.status)}`}>
                        {formatIntegrationStatus(video.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">{formatIntegrationTime(video.updated_at || video.last_modified)}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">{formatIntegrationBytes(video.size_bytes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function Integration({
  activeUseCase,
  integrationForm,
  integrationOverview,
  integrationModelState,
  integrationError,
  isConnectingIntegration,
  integrationMode,
  integrationManualModelMode,
  integrationAutoModelMode,
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
  onIntegrationManualModelModeChange,
  onIntegrationAutoModelModeChange,
  onIntegrationFetchCountChange,
  onIntegrationFetchVideos,
  onIntegrationSelectionChange,
  onIntegrationProcessSelected,
  onToggleRunAnalysis,
}) {
  const supportedUseCase = integrationSupportedUseCases.has(activeUseCase.id);
  const useCaseLabel = activeUseCase.title;
  const connection = integrationOverview?.connection;
  const recentRuns = integrationOverview?.recent_runs ?? [];
  const activeMode = connection?.processing_mode ?? integrationMode;
  const isAutoMode = activeMode === "auto";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="grid gap-8 xl:grid-cols-[1.25fr_1fr]">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Integration Configuration</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Connect to MinIO object storage to route videos through the <strong>{useCaseLabel}</strong> pipeline.
              Supports Auto (continuous monitoring) and Manual (on-demand upload) modes.
            </p>
            <div className="mt-4 rounded-xl border border-brandBlue/10 bg-brandBlue/[0.02] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brandBlue">Demo Flow</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Connect to MinIO → choose Auto or Manual mode → process videos through <strong>{useCaseLabel}</strong> → view outputs here.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <StorageProviderCard active subtitle="Configured for the current client demo." title="MinIO" />
            <StorageProviderCard subtitle="Placeholder for future connectors." title="AWS S3" />
            <StorageProviderCard subtitle="Placeholder for future connectors." title="Azure Blob" />
          </div>
        </div>

        {!supportedUseCase && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
            MinIO integration is available for <strong>PPE Detection</strong>, <strong>Region Alerts</strong>, and <strong>Fire Detection</strong>. Switch to one of those use cases to connect.
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 p-6">
          <div className="mb-5">
            <div className="mb-2 text-sm font-semibold text-slate-700">Processing Mode</div>
            <div className="flex flex-wrap gap-3">
              <IntegrationModeButton active={activeMode === "auto"} label="Auto" onClick={() => onIntegrationModeChange("auto")} />
              <IntegrationModeButton active={activeMode === "manual"} label="Manual" onClick={() => onIntegrationModeChange("manual")} />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {isAutoMode
                ? `Auto mode continuously monitors the MinIO input prefix and processes new ${useCaseLabel} videos automatically.`
                : `Manual mode fetches videos already present in the MinIO input prefix and processes only the ${useCaseLabel} videos you select.`}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <IntegrationField label="Endpoint / URL" onChange={(value) => onIntegrationFieldChange("endpoint", value)} placeholder="http://127.0.0.1:9000" value={integrationForm.endpoint} />
            <IntegrationField label="Access Key" onChange={(value) => onIntegrationFieldChange("access_key", value)} placeholder="minioadmin" value={integrationForm.access_key} />
            <IntegrationField label="Secret Key" onChange={(value) => onIntegrationFieldChange("secret_key", value)} placeholder="minioadmin" type="password" value={integrationForm.secret_key} />
            <IntegrationField label="Bucket" onChange={(value) => onIntegrationFieldChange("bucket", value)} placeholder="vision-demo" value={integrationForm.bucket} />
            <IntegrationField label="Input Prefix" onChange={(value) => onIntegrationFieldChange("input_prefix", value)} placeholder="input/" value={integrationForm.input_prefix} />
            <IntegrationField label="Output Prefix" onChange={(value) => onIntegrationFieldChange("output_prefix", value)} placeholder="output/" value={integrationForm.output_prefix} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-xl bg-brandBlue px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={!supportedUseCase || isConnectingIntegration}
              onClick={() => onIntegrationConnect()}
              type="button"
            >
              {isConnectingIntegration ? "Connecting…" : integrationOverview.connected ? "Reconnect MinIO" : "Connect"}
            </button>
            {integrationOverview.connected && (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(integrationOverview.processing ? "processing" : "completed")}`}>
                {integrationOverview.processing ? "Connected • Processing" : "Connected"}
              </span>
            )}
            {!integrationOverview.connected && supportedUseCase && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Not Connected
              </span>
            )}
            {connection && (
              <span className="text-sm text-slate-500">
                {connection.bucket} • {connection.input_prefix} → {connection.output_prefix}
              </span>
            )}
          </div>

          {(integrationError || integrationOverview.message) && (
            <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm font-medium ${integrationError ? "border-red-200 bg-red-50 text-red-700" : "border-brandBlue/15 bg-brandBlue/[0.03] text-slate-700"}`}>
              {integrationError || integrationOverview.message}
            </div>
          )}
          {connection && (
            <div className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400">
              Provider: {connection.provider} • Mode: {activeMode} • Credentials: {connection.credential_mode}
            </div>
          )}
        </div>
      </section>

      {isAutoMode ? (
        <IntegrationAutoPanel
          connection={connection}
          isConnected={integrationOverview.connected}
          isProcessing={integrationOverview.processing}
          modelState={integrationModelState}
          selectedModelMode={integrationAutoModelMode}
          useCaseLabel={useCaseLabel}
          onModelModeChange={onIntegrationAutoModelModeChange}
        />
      ) : (
        <IntegrationManualPanel
          connection={connection}
          disabled={!supportedUseCase || !integrationOverview.connected}
          fetchCount={integrationFetchCount}
          fetchedVideos={integrationFetchedVideos}
          isFetching={isFetchingIntegrationVideos}
          modelState={integrationModelState}
          isProcessing={isProcessingIntegrationVideos}
          fetchMessage={integrationFetchMessage}
          processMessage={integrationProcessMessage}
          selectedModelMode={integrationManualModelMode}
          selectedVideos={selectedIntegrationVideos}
          useCaseLabel={useCaseLabel}
          onModelModeChange={onIntegrationManualModelModeChange}
          onFetchCountChange={onIntegrationFetchCountChange}
          onFetchVideos={onIntegrationFetchVideos}
          onProcessSelected={onIntegrationProcessSelected}
          onSelectionChange={onIntegrationSelectionChange}
        />
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <IntegrationMetricCard
          helper={isAutoMode ? "Videos discovered in the MinIO input prefix." : "Total videos currently available in the use-case-specific MinIO input prefix."}
          label="Available Inputs"
          value={integrationOverview.summary?.input_videos ?? 0}
        />
        <IntegrationMetricCard helper="Queued or in-flight runs for the current use case." label="Queued / Processing" value={integrationOverview.summary?.processing_runs ?? 0} />
        <IntegrationMetricCard
          helper={integrationOverview.processing ? "Pipeline is actively processing." : "Last batch complete or awaiting new inputs."}
          label="Recent Runs"
          value={recentRuns.length}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Recent Runs</h3>
            <p className="mt-1 text-sm text-slate-500">MinIO-backed {useCaseLabel} runs — input key, output key, status, and timestamps.</p>
          </div>
          {integrationOverview.last_sync_at && (
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last sync: {formatIntegrationTime(integrationOverview.last_sync_at)}</span>
          )}
        </div>
        {recentRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            {integrationOverview.connected ? `No ${useCaseLabel} runs yet. Fetch input videos or let Auto mode discover new ones.` : "Connect to MinIO to see recent processing runs."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Input Object</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Output Object</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Updated</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {recentRuns.map((run) => (
                  <Fragment key={run.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm text-slate-700">
                        <div className="font-medium text-slate-800">{run.input_key.split("/").pop()}</div>
                        <div className="mt-1 break-all text-xs text-slate-500">{run.input_key}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {run.output_key ? (
                          <>
                            <div className="font-medium text-slate-800">{run.output_key.split("/").pop()}</div>
                            <div className="mt-1 break-all text-xs text-slate-500">{run.output_key}</div>
                          </>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(run.status)}`}>{formatIntegrationStatus(run.status)}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{formatIntegrationTime(run.updated_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-3">
                          {run.output_url ? (
                            <a className="text-sm font-semibold text-brandBlue hover:underline" href={resolveBackendUrl(run.output_url)} onClick={() => console.log("Run output_url:", resolveBackendUrl(run.output_url))} rel="noreferrer" target="_blank">Open Output</a>
                          ) : run.input_url ? (
                            <a className="text-sm font-semibold text-brandBlue hover:underline" href={resolveBackendUrl(run.input_url)} rel="noreferrer" target="_blank">Open Input</a>
                          ) : (
                            <span className="text-sm text-slate-400">Unavailable</span>
                          )}
                          <button className="text-sm font-semibold text-brandBlue hover:underline disabled:cursor-not-allowed disabled:text-slate-400" disabled={!run.metrics || Object.keys(run.metrics).length === 0} onClick={() => onToggleRunAnalysis(run.id)} type="button">
                            Output Analysis
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRunId === run.id && (
                      <tr className="bg-slate-50/80">
                        <td className="px-5 pb-5 pt-0" colSpan={5}>
                          <RunAnalysisPanel run={run} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

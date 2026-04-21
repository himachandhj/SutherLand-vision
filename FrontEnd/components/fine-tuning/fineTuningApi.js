import { API_BASE_URL } from "../visionLabConfig";

async function parseApiResponse(response) {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { detail: text };
  }
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : "";
    throw new Error(detail || `Fine-tuning request failed with status ${response.status}`);
  }
  return payload;
}

async function fineTuningRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });
  return parseApiResponse(response);
}

export function loadStepOne(usecaseSlug) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(usecaseSlug)}/step-1`);
}

export function runDataCheck(sessionId) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/run-data-check`, {
    method: "POST",
  });
}

export function loadDataCheckStatus(sessionId) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/data-check-status`);
}

export function startSetup(sessionId) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/start-setup`, {
    method: "POST",
  });
}

export function loadDatasets(sessionId) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/datasets`);
}

export function registerDataset(sessionId, payload) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/datasets/register`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function selectDataset(sessionId, datasetId) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/datasets/select`, {
    method: "POST",
    body: JSON.stringify({ dataset_id: Number(datasetId) }),
  });
}

export function loadDatasetDetail(sessionId, datasetId) {
  return fineTuningRequest(
    `/api/fine-tuning/${encodeURIComponent(String(sessionId))}/datasets/${encodeURIComponent(String(datasetId))}`,
  );
}

export function loadLabelState(sessionId) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/labels`);
}

export function updateLabelStatus(sessionId, labelStatus) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/labels/status`, {
    method: "POST",
    body: JSON.stringify({ label_status: labelStatus }),
  });
}

export function prepareDatasetReadyPayload(sessionId) {
  return fineTuningRequest(`/api/fine-tuning/${encodeURIComponent(String(sessionId))}/prepare-dataset-ready-payload`, {
    method: "POST",
  });
}

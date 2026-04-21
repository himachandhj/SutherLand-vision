const classBreakdownByUseCase = {
  "ppe-detection": [
    { label: "Helmet compliance", baseline: "84%", candidate: "91%", note: "Improved on side-angle workers." },
    { label: "Vest compliance", baseline: "88%", candidate: "92%", note: "More stable in low-contrast scenes." },
    { label: "Boots / shoes", baseline: "73%", candidate: "86%", note: "Better close-to-ground recall." },
  ],
  "region-alerts": [
    { label: "Person intrusion", baseline: "81%", candidate: "90%", note: "Reduced false alerts at polygon edges." },
    { label: "Forklift intrusion", baseline: "79%", candidate: "87%", note: "Improved for partially occluded vehicles." },
    { label: "Dwell breach", baseline: "76%", candidate: "84%", note: "Cleaner sustained breach detection." },
  ],
  "fire-detection": [
    { label: "Fire signal", baseline: "80%", candidate: "89%", note: "Higher recall on early flame cues." },
    { label: "Smoke signal", baseline: "77%", candidate: "86%", note: "Improved against low-contrast smoke." },
    { label: "False alarm control", baseline: "68%", candidate: "82%", note: "Fewer nuisance alerts from lighting flicker." },
  ],
  "speed-estimation": [
    { label: "Speed estimate quality", baseline: "78%", candidate: "86%", note: "Tighter match to calibration clips." },
    { label: "Overspeeding precision", baseline: "75%", candidate: "88%", note: "Better decision quality around speed limits." },
    { label: "Lane coverage", baseline: "82%", candidate: "90%", note: "Improved at wider camera angles." },
  ],
  "queue-management": [
    { label: "Queue length quality", baseline: "79%", candidate: "88%", note: "More stable under crowd density shifts." },
    { label: "Wait time estimate", baseline: "73%", candidate: "84%", note: "Better fit to service-rate patterns." },
    { label: "Breach detection", baseline: "76%", candidate: "86%", note: "Clearer alerts around threshold crossings." },
  ],
  "class-wise-object-counting": [
    { label: "Cars", baseline: "85%", candidate: "91%", note: "Improved under glare and lane overlap." },
    { label: "Trucks", baseline: "79%", candidate: "88%", note: "More robust for partial views." },
    { label: "Bikes", baseline: "71%", candidate: "83%", note: "Reduced misses on small objects." },
  ],
  "object-tracking": [
    { label: "Track continuity", baseline: "74%", candidate: "85%", note: "Fewer identity breaks in occlusion." },
    { label: "Path quality", baseline: "77%", candidate: "86%", note: "Cleaner motion path sequences." },
    { label: "Anomaly confidence", baseline: "69%", candidate: "81%", note: "Better differentiation of unusual behavior." },
  ],
};

const evaluationSummaryByUseCase = {
  "ppe-detection": "The fine-tuned candidates improve PPE recall on your site-specific angles without forcing a production change yet.",
  "region-alerts": "The fine-tuned candidates reduce noisy boundary alerts while improving true restricted-zone detections.",
  "fire-detection": "The fine-tuned candidates better separate fire and smoke signals from nuisance visual patterns in your environment.",
  "speed-estimation": "The fine-tuned candidates show stronger calibration-aware speed estimates and cleaner overspeeding decisions.",
  "queue-management": "The fine-tuned candidates improve queue stability and breach detection under real customer flow conditions.",
  "class-wise-object-counting": "The fine-tuned candidates improve class separation so counts better reflect the real traffic mix.",
  "object-tracking": "The fine-tuned candidates improve track continuity and path reliability without changing the dashboard-facing shape.",
};

const previewSummaryByUseCase = {
  "ppe-detection": {
    current: ["Helmet miss at oblique angle", "Vest okay on frontal workers", "Boot detection drops in shadow"],
    candidate: ["Helmet recall improved", "Vest stable under glare", "Boot coverage improved near frame edge"],
  },
  "region-alerts": {
    current: ["Boundary flicker near polygon edge", "Late dwell confirmation", "Crowded entry overlap"],
    candidate: ["Cleaner polygon edge handling", "Earlier dwell confirmation", "Better separation in crowd overlap"],
  },
  "fire-detection": {
    current: ["Sensitive to lighting bloom", "Smoke confidence varies", "Night scene drift"],
    candidate: ["Lower false alarms from glare", "Stronger smoke confidence", "Night stability improved"],
  },
  "speed-estimation": {
    current: ["Calibration drift in far lane", "Wider speed spread", "Borderline overspeed uncertainty"],
    candidate: ["Tighter lane calibration", "More stable speed estimates", "Cleaner overspeed decision line"],
  },
  "queue-management": {
    current: ["Queue edge flicker", "Wait estimate jumps at peak", "Counter reassignment noise"],
    candidate: ["Queue boundary more stable", "Wait estimate smoother", "Counter-specific behavior captured"],
  },
  "class-wise-object-counting": {
    current: ["Truck / van confusion", "Bike misses in dense frame", "Glare reduces class confidence"],
    candidate: ["Better heavy-vehicle separation", "Bike recall improved", "Class confidence more stable"],
  },
  "object-tracking": {
    current: ["Track handoff breaks", "Occlusion identity drift", "Long dwell uncertainty"],
    candidate: ["Fewer track breaks", "Better occlusion recovery", "Stronger long-dwell stability"],
  },
};

const healthChecksByUseCase = {
  "speed-estimation": [
    { label: "Calibration references", status: "warning", detail: "Reference distance exists, but only one lane has a known marker." },
    { label: "Missing labels", status: "warning", detail: "6% of clips need assisted labeling or imported annotations." },
    { label: "Corrupt files", status: "compliant", detail: "No broken media files were detected in the mock audit." },
    { label: "Class imbalance", status: "warning", detail: "Fast-moving bikes are underrepresented compared with cars." },
    { label: "Format conversion", status: "compliant", detail: "Current export can be normalized into YOLO-compatible assets." },
  ],
};

function getHealthChecks(useCaseId) {
  return (
    healthChecksByUseCase[useCaseId] ?? [
      { label: "Missing labels", status: "warning", detail: "A small portion of frames still need labels or annotation import." },
      { label: "Corrupt files", status: "compliant", detail: "No broken files were found in the mock dataset scan." },
      { label: "Duplicate images", status: "warning", detail: "Near-duplicate frames were found and can be deduplicated automatically." },
      { label: "Class imbalance", status: "warning", detail: "One or two classes are underrepresented and may need targeted collection." },
      { label: "Format conversion", status: "compliant", detail: "The current export can be standardized into the platform format." },
    ]
  );
}

function getClassBreakdown(useCaseId) {
  return classBreakdownByUseCase[useCaseId] ?? [];
}

function getPreviewSummary(useCaseId) {
  return previewSummaryByUseCase[useCaseId] ?? { current: [], candidate: [] };
}

const progressMarks = [14, 28, 44, 63, 79, 92];

function buildTimeline() {
  return [
    {
      id: "upload",
      label: "Uploading your examples",
      detail: "Create the workspace and store the files safely.",
      status: "complete",
    },
    {
      id: "validate",
      label: "Checking your data",
      detail: "Scan for missing labels, broken files, and gaps in coverage.",
      status: "pending",
    },
    {
      id: "convert",
      label: "Getting files ready",
      detail: "Turn different file types into one clean training-ready format.",
      status: "pending",
    },
    {
      id: "split",
      label: "Splitting examples fairly",
      detail: "Prepare clean practice and test groups so the comparison is fair.",
      status: "pending",
    },
    {
      id: "train",
      label: "Training new versions",
      detail: "Train improved versions using your chosen goal and safe defaults.",
      status: "pending",
    },
    {
      id: "evaluate",
      label: "Comparing versions",
      detail: "Compare the current model and the new versions using held-out examples.",
      status: "pending",
    },
    {
      id: "package",
      label: "Preparing go-live package",
      detail: "Package the winning version, review notes, and rollout details.",
      status: "pending",
    },
  ];
}

export function buildMockFineTuningState(useCase) {
  const preview = getPreviewSummary(useCase.id);
  return {
    dataset: {
      id: `${useCase.id}-dataset-live`,
      name: `${useCase.title} Site Dataset`,
      source: "existing",
      format: "Mixed CCTV export",
      item_count: "12,480 images / 164 clips",
      labeled: true,
      annotation_mode: "already-labeled",
      status: "ready",
      updated_at: "2 hours ago",
      note: "Representative data from real deployment cameras, ready for health checks and format standardization.",
    },
    datasets: [
      {
        id: `${useCase.id}-dataset-live`,
        name: `${useCase.title} Site Dataset`,
        source: "existing",
        format: "Mixed CCTV export",
        item_count: "12,480 images / 164 clips",
        labeled: true,
        annotation_mode: "already-labeled",
        status: "ready",
        updated_at: "2 hours ago",
        note: "Best current candidate for guided training.",
      },
      {
        id: `${useCase.id}-dataset-lab`,
        name: `${useCase.title} Validation Pack`,
        source: "storage",
        format: "YOLO export",
        item_count: "4,100 labeled images",
        labeled: true,
        annotation_mode: "import-external",
        status: "healthy",
        updated_at: "Yesterday",
        note: "Useful when you need a faster validation-only tuning cycle.",
      },
    ],
    datasetHealth: {
      score: 86,
      readiness: "Mostly ready. A short audit and light preprocessing are recommended before training.",
      split_summary: { train: "70%", validation: "20%", test: "10%" },
      top_actions: [
        "Label the few missing examples before a long run.",
        "Remove repeated frames from long static scenes.",
        "Keep a small holdout set for final side-by-side checks.",
      ],
      good_example_tips: [
        "Use footage that looks like your real cameras, not only clean demo images.",
        "Show different angles, lighting conditions, and distances.",
        "Include enough examples for every important class or safety case.",
        "If a person cannot tell quickly what is happening, the model will struggle too.",
      ],
      checks: getHealthChecks(useCase.id),
      preprocessing_steps: [
        "Normalize annotation format into the platform standard",
        "Remove near-duplicate frames from long static sequences",
        "Generate clean train / validation / test splits",
        "Prepare a smaller holdout set for side-by-side candidate comparison",
      ],
    },
    trainingJob: {
      id: `${useCase.id}-job-001`,
      status: "ready",
      current_stage: "Waiting to start",
      progress_percent: 12,
      elapsed: "00:00",
      eta: "Not started",
      best_metric: "No candidate yet",
      next_up: "Run the data check, then choose how deep you want the tuning run to go.",
      plain_english_status:
        "Once you start, we will validate the dataset, standardize formats, generate clean splits, train several candidates, and compare them with the current model before anything is promoted.",
      activity_feed: [
        { id: "job-activity-1", time: "Just now", title: "Workspace ready", detail: "This fine-tuning flow is ready for your first dataset check." },
        { id: "job-activity-2", time: "Earlier", title: "Current model imported", detail: "The current production model is available as the starting point." },
        { id: "job-activity-3", time: "Earlier", title: "Safe rollout mode on", detail: "Nothing will replace production until you explicitly approve it." },
      ],
      timeline: buildTimeline(),
    },
    evaluation: {
      summary: evaluationSummaryByUseCase[useCase.id] ?? "Candidate models are ready to compare against the baseline.",
      baseline_model: {
        id: "baseline-current",
        name: `${useCase.title} Current Model`,
        version: "Production v3.2",
        metrics: [
          { label: "Quality score", value: "82.4%" },
          { label: "Response time", value: "142 ms" },
          { label: "False alarms", value: "7.8%" },
        ],
      },
      candidate_models: [
        {
          id: "best-accuracy",
          badge: "Strongest quality",
          name: `${useCase.title} Candidate A`,
          version: "FT-2026-04-A",
          summary: "Pushes overall quality the highest, best when you want to catch more real issues.",
          metrics: [
            { label: "Quality score", value: "91.3%" },
            { label: "Response time", value: "184 ms" },
            { label: "False alarms", value: "5.4%" },
          ],
          recommendation: "Best when the business wants the strongest overall catch rate.",
          preview: {
            current: preview.current,
            candidate: preview.candidate,
          },
        },
        {
          id: "fastest-runtime",
          badge: "Fastest response",
          name: `${useCase.title} Candidate B`,
          version: "FT-2026-04-B",
          summary: "Stays quicker while still improving over the current version.",
          metrics: [
            { label: "Quality score", value: "87.2%" },
            { label: "Response time", value: "96 ms" },
            { label: "False alarms", value: "6.2%" },
          ],
          recommendation: "Best when speed matters more than squeezing out the last bit of quality.",
          preview: {
            current: preview.current,
            candidate: preview.candidate,
          },
        },
        {
          id: "best-tradeoff",
          badge: "Best overall balance",
          name: `${useCase.title} Candidate C`,
          version: "FT-2026-04-C",
          summary: "Best overall business balance across quality, speed, and false alarms.",
          metrics: [
            { label: "Quality score", value: "89.4%" },
            { label: "Response time", value: "124 ms" },
            { label: "False alarms", value: "4.9%" },
          ],
          recommendation: "Recommended default because it improves quality without becoming much heavier to run.",
          preview: {
            current: preview.current,
            candidate: preview.candidate,
          },
        },
      ],
      improvement_story: [
        {
          title: "Closer to your real site",
          detail: "The new versions learn from your lighting, camera angle, and scene layout instead of relying only on a general starting model.",
        },
        {
          title: "Better signal, less noise",
          detail: "The comparison focuses on catching more real issues while cutting avoidable false warnings.",
        },
        {
          title: "Safer rollout",
          detail: "You compare before and after first, then decide whether a new version is ready for staging or production.",
        },
      ],
      review_buckets: [
        {
          title: "What got better",
          items: [
            "Handles site-specific lighting more smoothly",
            "Recovers more hard scenes and partial views",
            "Cuts some of the noisy warnings seen in the current version",
          ],
        },
        {
          title: "Check before go-live",
          items: [
            "Review edge cases from night shifts or low-light cameras",
            "Confirm small classes still have enough examples",
            "Verify that the faster version is still good enough for the business",
          ],
        },
      ],
      class_breakdown: getClassBreakdown(useCase.id),
      gallery: [
        {
          title: "Where the current model was too noisy",
          detail: "Review moments where the current model warned but the new version stayed calm.",
        },
        {
          title: "Where the new version recovered misses",
          detail: "Review hard scenes where the new version caught something the current model missed.",
        },
        {
          title: "Class-by-class picture",
          detail: "Show a simple class comparison once backend evaluation files are available.",
        },
      ],
    },
    deployment: {
      current_model: {
        name: `${useCase.title} Current Model`,
        version: "Production v3.2",
        environment: "Production",
      },
      last_action: "No promotion actions yet. The deployed model remains unchanged.",
      rollback_note: "Rollback stays simple because the current production version is preserved until you explicitly replace it.",
      rollout_plan: [
        "Save the new version",
        "Try it in staging",
        "Promote it only after a quick side-by-side check",
      ],
    },
  };
}

export function runDatasetAudit(state) {
  return {
    ...state,
    datasetHealth: {
      ...state.datasetHealth,
      score: 91,
      readiness: "Dataset audit complete. A few warnings remain, but the dataset is ready for guided tuning.",
    },
    trainingJob: {
      ...state.trainingJob,
      status: "ready",
      current_stage: "Dataset validated",
      progress_percent: 18,
      elapsed: "00:02",
      eta: "Ready to train",
      plain_english_status:
        "The dataset has been checked. We can now convert formats, generate clean splits, and begin guided training when you are ready.",
      next_up: "Choose what matters most, then pick how deep the tuning run should go.",
      activity_feed: [
        { id: "job-activity-audit", time: "Just now", title: "Data check finished", detail: "The dataset passed the first health check and is ready for the next step." },
        ...state.trainingJob.activity_feed,
      ].slice(0, 4),
      timeline: state.trainingJob.timeline.map((item, index) =>
        index === 0 || index === 1 ? { ...item, status: "complete" } : item,
      ),
    },
  };
}

export function advanceMockTraining(state) {
  const timeline = state.trainingJob.timeline.map((item) => ({ ...item }));
  const runningIndex = timeline.findIndex((item) => item.status === "running");
  const pendingIndex = timeline.findIndex((item) => item.status === "pending");

  if (runningIndex === -1 && pendingIndex === -1) {
    return state;
  }

  if (runningIndex === -1) {
    timeline[pendingIndex].status = "running";
    return {
      ...state,
      trainingJob: {
        ...state.trainingJob,
        status: "running",
        current_stage: timeline[pendingIndex].label,
        progress_percent: progressMarks[pendingIndex] ?? 24,
        elapsed: "00:06",
        eta: "~42 min",
        best_metric: pendingIndex >= 4 ? "mAP50 0.86" : "Collecting first metrics",
        next_up: pendingIndex >= 4 ? "We will compare versions and prepare the strongest one for review." : "We are still getting the files and checks into place before training really starts.",
        plain_english_status: timeline[pendingIndex].detail,
        activity_feed: [
          {
            id: `job-activity-${timeline[pendingIndex].id}`,
            time: "Just now",
            title: timeline[pendingIndex].label,
            detail: timeline[pendingIndex].detail,
          },
          ...state.trainingJob.activity_feed,
        ].slice(0, 4),
        timeline,
      },
    };
  }

  timeline[runningIndex].status = "complete";
  const nextPendingIndex = timeline.findIndex((item) => item.status === "pending");

  if (nextPendingIndex === -1) {
    return {
      ...state,
      trainingJob: {
        ...state.trainingJob,
        status: "complete",
        current_stage: "Candidate ready for review",
        progress_percent: 100,
        elapsed: "00:48",
        eta: "Complete",
        best_metric: "mAP50 0.91",
        next_up: "Compare the new versions, run a quick side-by-side check, and choose whether to save, stage, or promote.",
        plain_english_status:
          "Training and evaluation are complete. You can now compare the candidates, validate with a small sample, and decide whether to promote the new model.",
        activity_feed: [
          { id: "job-activity-complete", time: "Just now", title: "Training finished", detail: "The new versions are ready for comparison and rollout review." },
          ...state.trainingJob.activity_feed,
        ].slice(0, 4),
        timeline,
      },
    };
  }

  timeline[nextPendingIndex].status = "running";

  return {
    ...state,
    trainingJob: {
      ...state.trainingJob,
      status: "running",
      current_stage: timeline[nextPendingIndex].label,
      progress_percent: progressMarks[nextPendingIndex] ?? state.trainingJob.progress_percent,
      elapsed: `00:${String(10 + nextPendingIndex * 6).padStart(2, "0")}`,
      eta: nextPendingIndex >= 5 ? "~6 min" : "~24 min",
      best_metric: nextPendingIndex >= 4 ? "mAP50 0.89" : "Best checkpoint still warming up",
      next_up: nextPendingIndex >= 5 ? "We are almost ready to show the best new version." : "We are moving through the guided flow step by step.",
      plain_english_status: timeline[nextPendingIndex].detail,
      activity_feed: [
        {
          id: `job-activity-${timeline[nextPendingIndex].id}`,
          time: "Just now",
          title: timeline[nextPendingIndex].label,
          detail: timeline[nextPendingIndex].detail,
        },
        ...state.trainingJob.activity_feed,
      ].slice(0, 4),
      timeline,
    },
  };
}

export function promoteMockCandidate(state, candidateId, action) {
  const candidate = state.evaluation.candidate_models.find((item) => item.id === candidateId) ?? state.evaluation.candidate_models[0];
  if (!candidate) return state;

  if (action === "keep-current") {
    return {
      ...state,
      deployment: {
        ...state.deployment,
        last_action: "Kept the current production model in place. Candidate remains available for further validation.",
      },
    };
  }

  if (action === "candidate") {
    return {
      ...state,
      deployment: {
        ...state.deployment,
        last_action: `${candidate.name} (${candidate.version}) was saved as a tracked candidate model.`,
      },
    };
  }

  return {
    ...state,
    deployment: {
      ...state.deployment,
      current_model:
        action === "production"
          ? {
              name: candidate.name,
              version: candidate.version,
              environment: "Production",
            }
          : {
              ...state.deployment.current_model,
              environment: "Production",
            },
      last_action:
        action === "staging"
          ? `${candidate.name} (${candidate.version}) was prepared for staging validation. Production remains unchanged.`
          : `${candidate.name} (${candidate.version}) was marked as the next production model in the UI preview.`,
    },
  };
}

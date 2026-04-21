function SettingField({ label, helper, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      {children}
      {helper ? <span className="text-xs leading-5 text-slate-500">{helper}</span> : null}
    </label>
  );
}

function Input({ value, onChange, type = "text", placeholder }) {
  return (
    <input
      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
      placeholder={placeholder}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function AdvancedSettings({ settings, onChange }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Advanced Settings</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SettingField helper="Fixed epoch budget when deeper control is needed." label="Epochs">
          <Input value={settings.epochs} onChange={(value) => onChange("epochs", value)} />
        </SettingField>
        <SettingField helper="Mini-batch size for each optimization step." label="Batch size">
          <Input value={settings.batchSize} onChange={(value) => onChange("batchSize", value)} />
        </SettingField>
        <SettingField helper="Input resolution used during training." label="Image size">
          <Input value={settings.imageSize} onChange={(value) => onChange("imageSize", value)} />
        </SettingField>
        <SettingField helper="Start simple and let the backend map strategies later." label="Learning rate strategy">
          <Select
            options={[
              { value: "cosine", label: "Cosine decay" },
              { value: "one-cycle", label: "One-cycle" },
              { value: "constant", label: "Constant" },
            ]}
            value={settings.learningRate}
            onChange={(value) => onChange("learningRate", value)}
          />
        </SettingField>
        <SettingField helper="Stop earlier if validation stops improving." label="Early stopping patience">
          <Input value={settings.earlyStopping} onChange={(value) => onChange("earlyStopping", value)} />
        </SettingField>
        <SettingField helper="Holdout percentage used during validation." label="Validation split %">
          <Input value={settings.validationSplit} onChange={(value) => onChange("validationSplit", value)} />
        </SettingField>
        <SettingField helper="Reserved test percentage for final comparison." label="Test split %">
          <Input value={settings.testSplit} onChange={(value) => onChange("testSplit", value)} />
        </SettingField>
        <SettingField helper="How often checkpoints are saved during training." label="Checkpoint frequency">
          <Input value={settings.checkpointFrequency} onChange={(value) => onChange("checkpointFrequency", value)} />
        </SettingField>
        <SettingField helper="Backend can later map this to concrete optimizers." label="Optimizer">
          <Select
            options={[
              { value: "auto", label: "Auto" },
              { value: "adamw", label: "AdamW" },
              { value: "sgd", label: "SGD" },
            ]}
            value={settings.optimizer}
            onChange={(value) => onChange("optimizer", value)}
          />
        </SettingField>
        <SettingField helper="Comma-separated list for future export packaging." label="Export formats">
          <Input value={settings.exportFormats} onChange={(value) => onChange("exportFormats", value)} />
        </SettingField>
        <SettingField helper="Helps tune alert thresholds after training." label="Threshold tuning">
          <Select
            options={[
              { value: true, label: "Enabled" },
              { value: false, label: "Disabled" },
            ]}
            value={String(settings.thresholdTuning)}
            onChange={(value) => onChange("thresholdTuning", value === "true")}
          />
        </SettingField>
        <SettingField helper="Useful when one class is underrepresented." label="Class rebalance">
          <Select
            options={[
              { value: true, label: "Enabled" },
              { value: false, label: "Disabled" },
            ]}
            value={String(settings.classRebalance)}
            onChange={(value) => onChange("classRebalance", value === "true")}
          />
        </SettingField>
        <SettingField helper="Controls how aggressive preprocessing and augmentation become." label="Augmentation profile">
          <Select
            options={[
              { value: "light", label: "Light" },
              { value: "balanced", label: "Balanced" },
              { value: "aggressive", label: "Aggressive" },
            ]}
            value={settings.augmentationProfile}
            onChange={(value) => onChange("augmentationProfile", value)}
          />
        </SettingField>
        <SettingField helper="Short label for experiment tracking." label="Experiment tag">
          <Input value={settings.experimentTag} onChange={(value) => onChange("experimentTag", value)} />
        </SettingField>
        <label className="flex flex-col gap-1.5 text-sm md:col-span-2 xl:col-span-3">
          <span className="font-medium text-slate-800">Notes</span>
          <textarea
            className="min-h-[112px] w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
            placeholder="Optional experiment note, customer request, or deployment caution."
            value={settings.notes}
            onChange={(event) => onChange("notes", event.target.value)}
          />
          <span className="text-xs leading-5 text-slate-500">This can later map directly to training job metadata or experiment tracking notes.</span>
        </label>
      </div>
    </div>
  );
}

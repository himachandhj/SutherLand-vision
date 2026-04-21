function Field({ label, helper, value, onChange }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-xs leading-5 text-slate-500">{helper}</span>
    </label>
  );
}

export default function ObjectTrackingSettings({ settings, onChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field
        helper="Whether the training should lean toward speed or identity continuity."
        label="Identity priority"
        value={settings.identityPriority}
        onChange={(value) => onChange("identityPriority", value)}
      />
      <Field
        helper="Tolerance for partial or temporary object occlusion."
        label="Occlusion tolerance"
        value={settings.occlusionTolerance}
        onChange={(value) => onChange("occlusionTolerance", value)}
      />
      <Field
        helper="How long a track can disappear before it is considered lost."
        label="Lost track frames"
        value={settings.lostTrackFrames}
        onChange={(value) => onChange("lostTrackFrames", value)}
      />
      <Field
        helper="Placeholder for future zone transition and path inference controls."
        label="Path mode"
        value={settings.pathMode}
        onChange={(value) => onChange("pathMode", value)}
      />
    </div>
  );
}

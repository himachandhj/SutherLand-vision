function Field({ label, helper, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-xs leading-5 text-slate-500">{helper}</span>
    </label>
  );
}

export default function DefaultFineTuningSettings({ settings, onChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field
        helper="Describe the main camera placement or scene type."
        label="Camera profile"
        placeholder="factory-floor"
        value={settings.cameraProfile}
        onChange={(value) => onChange("cameraProfile", value)}
      />
      <Field
        helper="Capture whether scenes are bright, dark, mixed, or shift-driven."
        label="Lighting profile"
        placeholder="mixed-indoor"
        value={settings.lightingProfile}
        onChange={(value) => onChange("lightingProfile", value)}
      />
      <Field
        helper="Describe the main site rule or focus area that should shape training."
        label="Business policy focus"
        placeholder="helmet-vest-boots"
        value={settings.policyFocus}
        onChange={(value) => onChange("policyFocus", value)}
      />
      <label className="flex flex-col gap-1.5 text-sm md:col-span-2 xl:col-span-4">
        <span className="font-medium text-slate-800">Site notes</span>
        <textarea
          className="min-h-[96px] w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
          placeholder="Add anything the training workflow should remember later, such as unusual PPE colors, shift-specific smoke patterns, or expected object classes."
          value={settings.notes ?? ""}
          onChange={(event) => onChange("notes", event.target.value)}
        />
        <span className="text-xs leading-5 text-slate-500">This keeps room for use-case-specific metadata without forcing it into the main beginner-friendly flow.</span>
      </label>
    </div>
  );
}

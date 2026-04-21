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

export default function SpeedEstimationSettings({ settings, onChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Field
        helper="Frames per second expected during training and evaluation."
        label="Reference FPS"
        value={settings.calibrationFps}
        onChange={(value) => onChange("calibrationFps", value)}
      />
      <Field
        helper="Known real-world distance used to anchor calibration."
        label="Reference distance (m)"
        value={settings.referenceDistanceMeters}
        onChange={(value) => onChange("referenceDistanceMeters", value)}
      />
      <Field
        helper="Optional direct calibration value if the site already knows it."
        label="Meters per pixel"
        value={settings.metersPerPixel}
        onChange={(value) => onChange("metersPerPixel", value)}
      />
      <Field
        helper="Describe lane or roadway layout for future ROI support."
        label="Lane profile"
        value={settings.laneProfile}
        onChange={(value) => onChange("laneProfile", value)}
      />
      <Field
        helper="Acceptable business error band before raising an issue."
        label="Allowed speed error (km/h)"
        value={settings.speedToleranceKmh}
        onChange={(value) => onChange("speedToleranceKmh", value)}
      />
    </div>
  );
}

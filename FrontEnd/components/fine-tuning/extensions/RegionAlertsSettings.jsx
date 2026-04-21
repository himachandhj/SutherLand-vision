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

export default function RegionAlertsSettings({ settings, onChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field
        helper="Prepare for future multi-polygon or multi-zone configurations."
        label="Zone pack"
        value={settings.zonePack}
        onChange={(value) => onChange("zonePack", value)}
      />
      <Field
        helper="Minimum dwell time before the alert is considered a real breach."
        label="Alert dwell seconds"
        value={settings.alertDwellSeconds}
        onChange={(value) => onChange("alertDwellSeconds", value)}
      />
      <Field
        helper="Future-ready entry / exit direction constraint."
        label="Direction mode"
        value={settings.directionMode}
        onChange={(value) => onChange("directionMode", value)}
      />
      <Field
        helper="Extra temporal smoothing around polygon boundaries."
        label="Boundary buffer frames"
        value={settings.bufferFrames}
        onChange={(value) => onChange("bufferFrames", value)}
      />
    </div>
  );
}

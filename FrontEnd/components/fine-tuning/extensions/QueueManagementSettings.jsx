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

export default function QueueManagementSettings({ settings, onChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field
        helper="Keep room for future counter / lane definition packs."
        label="Counter layout"
        value={settings.counterLayout}
        onChange={(value) => onChange("counterLayout", value)}
      />
      <Field
        helper="Business baseline for expected service throughput."
        label="Service rate / minute"
        value={settings.serviceRatePerMinute}
        onChange={(value) => onChange("serviceRatePerMinute", value)}
      />
      <Field
        helper="Extra people allowed before a breach is raised."
        label="Breach buffer count"
        value={settings.breachBufferCount}
        onChange={(value) => onChange("breachBufferCount", value)}
      />
      <Field
        helper="Placeholder for future customer-type or lane-specific logic."
        label="Customer focus"
        value={settings.customerFocus}
        onChange={(value) => onChange("customerFocus", value)}
      />
    </div>
  );
}

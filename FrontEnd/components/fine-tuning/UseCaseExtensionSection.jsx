import DefaultFineTuningSettings from "./extensions/DefaultFineTuningSettings";
import ObjectTrackingSettings from "./extensions/ObjectTrackingSettings";
import QueueManagementSettings from "./extensions/QueueManagementSettings";
import RegionAlertsSettings from "./extensions/RegionAlertsSettings";
import SpeedEstimationSettings from "./extensions/SpeedEstimationSettings";

const extensionByUseCase = {
  "speed-estimation": SpeedEstimationSettings,
  "region-alerts": RegionAlertsSettings,
  "queue-management": QueueManagementSettings,
  "object-tracking": ObjectTrackingSettings,
};

export default function UseCaseExtensionSection({ activeUseCase, title, description, settings, onChange }) {
  const ExtensionComponent = extensionByUseCase[activeUseCase.id] ?? DefaultFineTuningSettings;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <ExtensionComponent settings={settings} onChange={onChange} />
    </section>
  );
}

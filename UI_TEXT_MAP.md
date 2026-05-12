# Sutherland Vision Hub UI Text Map

## 1. Quick edit guide

| What I want to change | File to open | What to search inside file | Notes / risk level |
| --- | --- | --- | --- |
| Change product name in browser tab | `FrontEnd/app/layout.jsx` | `Sutherland Vision Hub` | Safe. Metadata only. |
| Change header brand text/logo wording | `FrontEnd/components/BrandHeader.jsx` | `SUTHERLAND`, `VISION HUB` | Safe for text. Medium risk if changing image import. |
| Change landing page hero text | `FrontEnd/components/LandingPage.jsx` | `Turning Enterprise Videos into Vision Intelligence`, `Enterprise AI Vision` | Safe. Text-only edits are low risk. |
| Change landing page category card names/descriptions | `FrontEnd/components/visionLabConfig.js` | `categoryDetails` | Safe for labels/descriptions. Do not change `param` unless routing also changes. |
| Change use case card names/descriptions | `FrontEnd/components/visionLabConfig.js` | `useCases = [` | Safe for `title`, `description`, `backstory`. Do not change `id` casually. |
| Hide/show a use case | `FrontEnd/components/visionLabConfig.js` | `hidden: true`, `visibleUseCases` | Medium risk. Safe to toggle `hidden`, risky to change IDs/categories. |
| Rename Region Alerts on cards/listing | `FrontEnd/components/visionLabConfig.js` and `FrontEnd/components/UseCasesPage.jsx` | `Region Alerts`, `Region Intrusion Detection` | Medium risk because Region Alerts also has detail-page overrides elsewhere. |
| Change category sidebar names | `FrontEnd/components/visionLabConfig.js` | `Safety & Compliance`, `Security & Surveillance`, `Traffic Intelligence` | Low risk for text only. |
| Change detail page tab labels | `FrontEnd/components/visionLabConfig.js` | `tabs`, `Model Playground`, `Integration`, `Fine-Tuning`, `Dashboard` | Medium risk because URL param mapping lives beside labels. |
| Change Region Alerts detail page breadcrumb/title/Arabic labels | `FrontEnd/app/page.jsx` | `REGION_ALERTS_I18N`, `applyRegionAlertsDetailTranslations` | Safe for wording. Do not rename translation keys. |
| Change generic detail page heading for non-Region-Alerts use cases | `FrontEnd/components/DetailPage.jsx` | `Home`, `activeUseCase.title`, `activeUseCase.description` | Usually text comes from `visionLabConfig.js`. |
| Change Model Playground labels | `FrontEnd/components/ModelPlayground.jsx` and `FrontEnd/app/page.jsx` | `Upload image or video`, `Try a Sample`, `ROI`, `Run Preview` | Region Alerts uses `app/page.jsx`; most other use cases use `ModelPlayground.jsx`. |
| Change Integration tab labels | `FrontEnd/components/Integration.jsx` and `FrontEnd/app/page.jsx` | `Integration Configuration`, `Manual Fetch & Process`, `Output Analysis` | Region Alerts has extra translated labels in `app/page.jsx`. |
| Change Dashboard filter labels / chart titles / table headings | `FrontEnd/components/dashboard/dashboard-page.jsx` | `REGION_ALERTS_DASHBOARD_I18N`, `title:`, `columns:` | Low risk for labels. Medium risk if editing keys used by chart/table definitions. |
| Change Dashboard route fallback text | `FrontEnd/app/dashboard/[slug]/page.jsx` | `Dashboard not found`, `Go to PPE Dashboard` | Safe. |
| Change Fine-Tuning step wording | `FrontEnd/components/fine-tuning/FineTuningWizardSteps.jsx` and `FrontEnd/components/fine-tuning/FineTuningStepRail.jsx` | `Step 1`, `Step 2`, `Step 3`, `Fine-tuning flow` | Low risk for copy changes. |
| Change Fine-Tuning hero text/checklists/model names | `FrontEnd/components/fine-tuning/useCaseFineTuningConfig.js` | `heroTitle`, `heroSummary`, `datasetChecklist`, `baseModels` | Low risk for copy. Medium risk if changing model option `value`. |
| Change annotation editor classes | `BackEnd/app/services/annotation_service.py` and `FrontEnd/app/fine-tuning/[sessionId]/annotate/page.jsx` | `DEFAULT_CLASSES_BY_USE_CASE`, `defaultClassOptions`, `workspace?.classes` | Medium risk. Changing class names affects labels and training data meaning. |
| Change Region Alerts fine-tuning guidance text | `FrontEnd/app/fine-tuning/[sessionId]/annotate/page.jsx`, `FrontEnd/components/fine-tuning/FineTuningWizardSteps.jsx`, `BackEnd/app/services/dataset_contract_service.py` | `Region Alerts Detection`, `configured separately in Integration` | Safe for wording. |
| Change Arabic translations for Region Alerts | `FrontEnd/app/page.jsx` and `FrontEnd/components/dashboard/dashboard-page.jsx` | `REGION_ALERTS_I18N`, `REGION_ALERTS_DASHBOARD_I18N`, `عربي` | Low risk if you only edit string values. |

## 2. File-by-file map

### `FrontEnd/app/layout.jsx`
Purpose:
- Global page metadata.

Contains:
- Browser tab title.
- Meta description.

Search for:
- `Sutherland Vision Hub`
- `Enterprise AI Vision Website prototype`

Safe edits:
- Metadata text.

Risky edits:
- None, unless changing app shell structure.

### `FrontEnd/components/BrandHeader.jsx`
Purpose:
- Shared top-left branding used on landing and detail pages.

Contains:
- `SUTHERLAND`
- `VISION HUB`
- Logo alt text.

Search for:
- `SUTHERLAND`
- `VISION HUB`
- `Sutherland logo`

Safe edits:
- Brand text.
- Alt text.

Risky edits:
- Logo import/path changes.

### `FrontEnd/components/LandingPage.jsx`
Purpose:
- Main homepage hero, category cards, and footer.

Contains:
- Hero title/subtitle.
- `Explore Categories`.
- `Enterprise vision use cases by category`.
- Category descriptions pulled from config.

Search for:
- `Turning Enterprise Videos into Vision Intelligence`
- `Enterprise vision use cases by category`
- `Explore active vision use cases`

Safe edits:
- Hero text.
- Button/card copy.
- Footer alt text.

Risky edits:
- `onExploreSection` click behavior.
- Footer asset path.

### `FrontEnd/components/UseCasesPage.jsx`
Purpose:
- Category page showing visible use case cards.

Contains:
- Sidebar category labels.
- `Total Use Cases`.
- Category title/count text.
- Special Region Alerts presentation title: `Region Intrusion Detection`.

Search for:
- `Total Use Cases`
- `Operational vision use cases`
- `Region Intrusion Detection`

Safe edits:
- Card titles/descriptions.
- Count labels.
- Sidebar wording.

Risky edits:
- `isVisibleUseCase` filtering logic.
- Region Alerts special-case ID logic.

### `FrontEnd/components/visionLabConfig.js`
Purpose:
- Main UI catalog for use case names, descriptions, categories, tabs, defaults, and sample labels.

Contains:
- `useCases` array.
- `categoryDetails` array.
- `sampleMediaByUseCase`.
- `tabs`.
- `tabParamToLabel` / `tabLabelToParam`.
- `useCaseToAnalyticsDashboardSlug`.
- Integration input/output prefix defaults.

Common text labels found there:
- `Region Alerts`
- `Vehicle Analytics`
- `Fire Detection`
- `Crack Detection`
- `Unsafe Behavior Detection`
- `Object Tracking`
- `PPE Detection`
- `Safety & Compliance`
- `Security & Surveillance`
- `Traffic Intelligence`
- `Customer Experience`

Safe edits:
- `title`
- `description`
- `backstory`
- `deprecationNote`
- category descriptions

Risky edits:
- `id`
- `param`
- sample IDs
- slug mappings
- prefix defaults

### `FrontEnd/app/page.jsx`
Purpose:
- Main route controller plus Region Alerts detail-page text, Arabic translations, ROI copy, demo Integration copy, and Region Alerts Model Playground copy.

Contains:
- `REGION_ALERTS_I18N` English/Arabic strings.
- `applyRegionAlertsDetailTranslations`.
- Region Alerts tab labels.
- Model Playground upload/ROI text.
- Integration demo controls and summary labels.
- Language toggle: `English` / `عربي`.

Search for:
- `REGION_ALERTS_I18N`
- `Model Playground`
- `Integration Configuration`
- `Manual Fetch & Process`
- `Region Alerts Detection`
- `عربي`

Safe edits:
- Translation values in `REGION_ALERTS_I18N`.
- Region Alerts helper text.
- ROI labels.
- Upload/process labels.

Risky edits:
- Translation keys.
- `tabParamToLabel` / URL behavior.
- ROI math and processing payload builders.

### `FrontEnd/components/DetailPage.jsx`
Purpose:
- Generic detail page shell for non-dashboard tabs.

Contains:
- Breadcrumb labels.
- Active use case title/description.
- Tab rendering.
- `Redirecting to the analytics dashboard…`

Search for:
- `Home`
- `Redirecting to the analytics dashboard`

Safe edits:
- Breadcrumb text.
- Redirect notice.

Risky edits:
- Tab click handlers.
- Dashboard redirect behavior.

### `FrontEnd/components/ModelPlayground.jsx`
Purpose:
- Main playground UI for most use cases outside the Region Alerts special flow.

Contains:
- `Upload image or video`
- `Try a Sample`
- Input/output headings.
- Detection summaries.
- Use-case-specific helper notes.

Search for:
- `Upload image or video`
- `Try a Sample`
- `Vehicle Analytics`
- `Crack Detection uses`
- `Unsafe Behavior Detection uses`
- `Drag a rectangle on the current input preview`

Safe edits:
- Headings and helper copy.
- Use-case notes.

Risky edits:
- File upload behavior.
- ROI pointer logic.
- preview option field names.

### `FrontEnd/components/Integration.jsx`
Purpose:
- Shared Integration tab for all supported use cases.

Contains:
- `Integration Configuration`
- MinIO field labels.
- `Processing Mode`
- `Auto`
- `Manual`
- `Manual Fetch & Process`
- `Output Analysis`
- Region Alerts rule panel and summary card.
- Use-case-specific processing notes for Vehicle Analytics, Crack Detection, Unsafe Behavior Detection.

Search for:
- `Integration Configuration`
- `Endpoint / URL`
- `Manual Fetch & Process`
- `Recent Runs`
- `Alert Rules`
- `Active Region Alert Configuration`
- `Output Analysis`

Safe edits:
- Labels, descriptions, helper text, table headings.

Risky edits:
- MinIO field names.
- selection/process handlers.
- model mode values.

### `FrontEnd/components/dashboard/dashboard-page.jsx`
Purpose:
- Main analytics dashboard UI and Region Alerts dashboard localization.

Contains:
- `REGION_ALERTS_DASHBOARD_I18N`
- filter labels
- metric card labels
- chart titles/descriptions
- table headings
- dashboard titles for multiple use cases

Search for:
- `REGION_ALERTS_DASHBOARD_I18N`
- `Use Case Overview`
- `Detected Intrusion Events`
- `Incident Trend by Severity`
- `Recent Alerts by Zone`
- `Intrusion Type Breakdown`
- `Duration Risk Interpretation`
- `Triggered Cameras by Shift`
- `Vehicle Analytics Dashboard`

Safe edits:
- Translation values.
- chart titles/descriptions.
- table labels.

Risky edits:
- translation keys referenced by chart/table builders.
- data definition keys in `columns`, `metricDefs`, `extraFilterDefs`.

### `FrontEnd/app/dashboard/[slug]/page.jsx`
Purpose:
- Dashboard route wrapper and fallback text.

Contains:
- `Dashboard not found`
- `Go to PPE Dashboard`
- `Dashboard Home`

Safe edits:
- Fallback labels.

Risky edits:
- slug redirect logic.

### `FrontEnd/components/FineTuning.jsx`
Purpose:
- Fine-tuning page controller and step orchestration.

Contains:
- Fine-tuning status wording.
- dataset form defaults.
- legacy class-wise counting note.

Search for:
- `Fine-Tuning`
- `Class-wise counting is now included in Vehicle Analytics`
- `Training completed`

Safe edits:
- High-level copy.

Risky edits:
- payload maps like `MODEL_PAYLOAD_MAP` and `RUN_DEPTH_PAYLOAD_MAP`.

### `FrontEnd/components/fine-tuning/useCaseFineTuningConfig.js`
Purpose:
- Main text/config source for fine-tuning hero copy, checklists, model choices, extension section labels, and training-mode wording.

Contains:
- `goalOptions`
- `trainingModeOptions`
- `stopConditionOptions`
- per-use-case `heroTitle`
- `heroSummary`
- `datasetChecklist`
- `baseModels`
- `extensionTitle`
- `extensionDescription`

Search for:
- `Catch more real issues`
- `Recommended`
- `Deep tune`
- `Tune Vehicle Analytics for your camera geometry`
- `Adapt region alerts to your real zones`

Safe edits:
- Labels/helpers/titles/checklists.

Risky edits:
- option `value` fields.
- `recommended...Id` references.

### `FrontEnd/components/fine-tuning/FineTuningStepRail.jsx`
Purpose:
- Left sidebar labels for the fine-tuning flow.

Contains:
- `Fine-tuning flow`
- `Move step by step. Nothing goes live until you choose it.`
- `Current plan`
- `Step progress`

Safe edits:
- Copy only.

Risky edits:
- None beyond UI state wiring.

### `FrontEnd/components/fine-tuning/FineTuningWizardSteps.jsx`
Purpose:
- Main text-heavy file for fine-tuning Steps 1–3 and later training/comparison/promotion wording.

Contains:
- `Step 1`, `Step 2`, `Step 3`
- labeling path labels
- import/manual/auto-label wording
- Region Alerts detector-only guidance
- stage/promote success messages
- Integration handoff wording

Search for:
- `Step 1`
- `Step 2`
- `Step 3`
- `Choose your labeling path`
- `Region Alerts fine-tuning improves the person detector`
- `Model staged successfully`
- `Model promoted successfully`

Safe edits:
- Instructional wording.
- step helper text.
- status messages.

Risky edits:
- state/flow branching tied to workflow IDs.

### `FrontEnd/app/fine-tuning/[sessionId]/annotate/page.jsx`
Purpose:
- Annotation editor page and manual/assist-label workflow text.

Contains:
- label status badges
- annotation workspace messages
- Region Alerts annotation guidance
- class selector usage

Search for:
- `Fine-tuning improves the object detector used by Region Alerts Detection`
- `Use labeled images or extracted video frames`
- `Suggestions approved`
- `Assist model`

Safe edits:
- Editor instructions.
- warnings and helper messages.

Risky edits:
- annotation payload fields.
- save/apply/assist flow logic.

### `BackEnd/app/services/annotation_service.py`
Purpose:
- Backend default class lists and annotation-format helpers that directly affect annotation labels shown in UI.

Contains:
- `DEFAULT_CLASSES_BY_USE_CASE`
- class name normalization
- label file generation/parsing

Search for:
- `DEFAULT_CLASSES_BY_USE_CASE`
- `region-alerts`
- `unsafe-behavior-detection`

Safe edits:
- Class names only if you intentionally want new label vocabulary.

Risky edits:
- Anything that changes YOLO label generation/parsing.
- Renaming classes after data already exists.

### `BackEnd/app/services/dataset_contract_service.py`
Purpose:
- Backend-generated dataset handoff guidance used by fine-tuning flows.

Contains:
- `REGION_ALERTS_HANDOFF_GUIDANCE`
- object tracking handoff guidance

Search for:
- `Prepared dataset fine-tunes only the detector used by Region Alerts Detection`
- `configured separately in Integration`

Safe edits:
- Guidance wording.

Risky edits:
- task type mappings and validation rules.

### `BackEnd/use_cases/registry.py`
Purpose:
- Backend registry of canonical use case titles, categories, and descriptions.

Contains:
- backend-facing `title`, `category`, `description` values

Search for:
- `title`
- `category`
- `description`

Safe edits:
- Display descriptions if backend APIs surface them.

Risky edits:
- use case keys, module paths, function names.

## 3. Use case name map

### Fire Detection
- Visible title:
  `Fire Detection`
- Slug / id:
  `fire-detection`
- Category:
  `Safety & Compliance`
- Files where title appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
  `FrontEnd/components/ModelPlayground.jsx`
- Files where description appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`

### PPE Detection
- Visible title:
  `PPE Detection`
- Slug / id:
  `ppe-detection`
- Category:
  `Safety & Compliance`
- Files where title appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
- Files where description appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`

### Region Alerts Detection
- Visible title:
  Card/listing: `Region Alerts` or `Region Intrusion Detection`
  Detail/dashboard/i18n: `Region Alerts Detection`
- Slug / id:
  `region-alerts`
- Category:
  `Security & Surveillance`
- Files where title appears:
  `FrontEnd/components/visionLabConfig.js`
  `FrontEnd/components/UseCasesPage.jsx`
  `FrontEnd/app/page.jsx`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
  `BackEnd/use_cases/registry.py`
- Files where description appears:
  `FrontEnd/components/visionLabConfig.js`
  `FrontEnd/app/page.jsx`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
  `BackEnd/use_cases/registry.py`

### Crack Detection
- Visible title:
  `Crack Detection`
- Slug / id:
  `crack-detection`
- Category:
  `Safety & Compliance`
- Files where title appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
  `FrontEnd/components/Integration.jsx`
- Files where description appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`

### Unsafe Behavior Detection
- Visible title:
  `Unsafe Behavior Detection`
- Slug / id:
  `unsafe-behavior-detection`
- Category:
  `Safety & Compliance`
- Files where title appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
  `FrontEnd/components/Integration.jsx`
- Files where description appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`

### Object Tracking
- Visible title:
  `Object Tracking`
- Slug / id:
  `object-tracking`
- Category:
  `Security & Surveillance`
- Files where title appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
- Files where description appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`

### Vehicle Analytics
- Visible title:
  UI card/title: `Vehicle Analytics`
  backend registry still also uses `Speed Estimation`
- Slug / id:
  `speed-estimation`
- Category:
  `Traffic Intelligence`
- Files where title appears:
  `FrontEnd/components/visionLabConfig.js`
  `FrontEnd/components/dashboard/dashboard-page.jsx`
  `FrontEnd/components/Integration.jsx`
  `FrontEnd/components/ModelPlayground.jsx`
  `FrontEnd/components/fine-tuning/useCaseFineTuningConfig.js`
  `BackEnd/use_cases/registry.py`
- Files where description appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`

## 4. Category map

### Safety & Compliance
- Files where category appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
  `FrontEnd/app/page.jsx`
- Use cases inside:
  `Fire Detection`
  `Crack Detection`
  `Unsafe Behavior Detection`
  `PPE Detection`
- Landing page card location:
  `FrontEnd/components/LandingPage.jsx` via `categoryDetails`
- Category page location:
  `FrontEnd/components/UseCasesPage.jsx`

### Security & Surveillance
- Files where category appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
- Use cases inside:
  `Region Alerts`
  `Object Tracking`
- Landing page card location:
  `FrontEnd/components/LandingPage.jsx`
- Category page location:
  `FrontEnd/components/UseCasesPage.jsx`

### Traffic Intelligence
- Files where category appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
- Use cases inside:
  `Vehicle Analytics`
  hidden legacy `Class-Wise Object Counting`
- Landing page card location:
  `FrontEnd/components/LandingPage.jsx`
- Category page location:
  `FrontEnd/components/UseCasesPage.jsx`

### Customer Experience
- Files where category appears:
  `FrontEnd/components/visionLabConfig.js`
  `BackEnd/use_cases/registry.py`
- Use cases inside:
  `Queue Management`
- Landing page card location:
  Defined in config but intentionally hidden from current frontend listing.
- Category page location:
  Filtered out in `LandingPage.jsx` and `UseCasesPage.jsx`.

## 5. Dashboard text map

Primary file:
- `FrontEnd/components/dashboard/dashboard-page.jsx`

For Region Alerts dashboard, edit here:

- Sidebar branding:
  `BrandHeader` component in `FrontEnd/components/BrandHeader.jsx`

- Dashboard title:
  `REGION_ALERTS_DASHBOARD_I18N.en.title`
  `REGION_ALERTS_DASHBOARD_I18N.ar.title`

- Dashboard description:
  `REGION_ALERTS_DASHBOARD_I18N.en.description`
  `REGION_ALERTS_DASHBOARD_I18N.ar.description`

- Filter labels:
  `filters`
  `filtersDescription`
  `from`
  `to`
  `timeGranularity`
  `location`
  `zone`
  `camera`
  `detectedClass`
  `intrusionType`
  `shift`
  `severity`
  `status`

- Metric card labels:
  `totalIntrusions`
  `highCriticalAlerts`
  `mostAffectedZone`
  `latestAlert`

- Chart titles/descriptions:
  `incidentTrendBySeverity`
  `incidentTrendDesc`
  `recentAlertsByZone`
  `recentAlertsByZoneDesc`
  `intrusionTypeBreakdown`
  `intrusionTypeBreakdownDesc`
  `durationRiskInterpretation`
  `durationRiskDesc`
  `triggeredCamerasByShift`
  `triggeredCamerasByShiftDesc`

- Table title/description:
  `detectedIntrusionEvents`
  `detectedIntrusionEventsDescription`

- Table column headings:
  `eventId`
  `camera`
  `zone`
  `shift`
  `detectedClass`
  `entryTime`
  `exitTime`
  `duration`
  `intrusionType`
  `severity`
  `status`
  `confidence`

- Empty-state labels:
  `noIntrusionEventsAvailableYet`
  `noIntrusionEventsAvailableDescription`
  `noProcessedIncidents`
  `noProcessedIncidentsDescription`

- Arabic translation keys if present:
  All of the above also exist under `REGION_ALERTS_DASHBOARD_I18N.ar`.

## 6. Model Playground / Integration map

Primary files:
- `FrontEnd/app/page.jsx`
- `FrontEnd/components/Integration.jsx`
- `FrontEnd/components/ModelPlayground.jsx`

For Region Alerts detail page:

- Model Playground upload labels:
  `FrontEnd/app/page.jsx`
  Search for:
  `uploadImageOrVideo`
  `uploadPrompt`
  `Upload input video`
  `Upload Another Video`

- ROI labels:
  `FrontEnd/app/page.jsx`
  Search for:
  `regionOfInterest`
  `roiHelp`
  `roiDetailOne`
  `roiDetailTwo`
  `Default ROI`
  `Select ROI manually`
  `Clear Manual ROI`

- Detection summary labels:
  `FrontEnd/app/page.jsx`
  Search for:
  `Number of intrusions`
  `Detected Class`
  `Severity`
  `Zone`

- Integration alert rule labels:
  `FrontEnd/app/page.jsx` for translated Region Alerts demo controls
  `FrontEnd/components/Integration.jsx` for shared Region Alerts rule panel
  Search for:
  `Alert Rules`
  `Trigger Type`
  `Detection Type / Intrusion Type`
  `Minimum Confidence`
  `Trigger alert after`
  `Enable Alerts`

- Manual Fetch & Process labels:
  `FrontEnd/components/Integration.jsx`
  Search for:
  `Manual Fetch & Process`
  `Fetch count`
  `Fetch Videos`
  `Fetch Files`
  `Process Selected`
  `Select All`
  `Clear Selection`

- Model path labels:
  `FrontEnd/components/Integration.jsx`
  Search for:
  `Model for this run`
  `Auto mode model`
  `Current backend model`
  `Current active model path`

- Output Analysis labels:
  `FrontEnd/components/Integration.jsx`
  Search for:
  `Output Analysis`
  `Recent Runs`
  `Input Object`
  `Output Object`
  `Status`
  `Updated`
  `Actions`

- Arabic translation keys if present:
  `FrontEnd/app/page.jsx`
  `REGION_ALERTS_I18N`
  Includes:
  `modelPlayground`
  `integration`
  `dashboard`
  `fineTuning`
  `uploadImageOrVideo`
  `alertRules`
  `integrationConfiguration`
  `manualFetchProcess`
  `processSelected`
  `zone`
  `triggerType`
  `minimumConfidence`

## 7. Fine-tuning map

Files related to Fine-Tuning Steps 1–3:

- Frontend files:
  `FrontEnd/components/FineTuning.jsx`
  `FrontEnd/components/fine-tuning/FineTuningStepRail.jsx`
  `FrontEnd/components/fine-tuning/FineTuningWizardSteps.jsx`
  `FrontEnd/components/fine-tuning/useCaseFineTuningConfig.js`
  `FrontEnd/app/fine-tuning/[sessionId]/annotate/page.jsx`

- Backend annotation/default class files:
  `BackEnd/app/services/annotation_service.py`

- Dataset contract / handoff guidance files:
  `BackEnd/app/services/dataset_contract_service.py`

Where to change Step 1/2/3 text:

- Main step titles/helpers:
  `FrontEnd/components/fine-tuning/FineTuningWizardSteps.jsx`
  Search for:
  `eyebrow="Step 1"`
  `eyebrow="Step 2"`
  `eyebrow="Step 3"`

- Left sidebar step wording:
  `FrontEnd/components/fine-tuning/FineTuningStepRail.jsx`

- Per-use-case hero/setup wording:
  `FrontEnd/components/fine-tuning/useCaseFineTuningConfig.js`
  Search for:
  `heroTitle`
  `heroSummary`
  `datasetChecklist`

Where to change annotation classes:

- Default class source of truth:
  `BackEnd/app/services/annotation_service.py`
  Search for:
  `DEFAULT_CLASSES_BY_USE_CASE`

- UI annotation workspace class usage:
  `FrontEnd/app/fine-tuning/[sessionId]/annotate/page.jsx`
  Search for:
  `defaultClassOptions`
  `classOptions`
  `selectedClass`

Where to change detector-only guidance:

- Region Alerts annotation page guidance:
  `FrontEnd/app/fine-tuning/[sessionId]/annotate/page.jsx`
  Search for:
  `Fine-tuning improves the object detector used by Region Alerts Detection`

- Region Alerts step guidance:
  `FrontEnd/components/fine-tuning/FineTuningWizardSteps.jsx`
  Search for:
  `Region Alerts fine-tuning improves the person detector`

- Backend handoff wording:
  `BackEnd/app/services/dataset_contract_service.py`
  Search for:
  `REGION_ALERTS_HANDOFF_GUIDANCE`

## 8. Search commands

```bash
grep -R "Region Alerts" -n FrontEnd
grep -R "Sutherland Vision Hub" -n FrontEnd
grep -R "Use Case Overview" -n FrontEnd
grep -R "Fine-Tuning" -n FrontEnd
grep -R "person" -n BackEnd/app/services
```

Useful extra commands for this repo:

```bash
grep -R "Safety & Compliance" -n FrontEnd
grep -R "Vehicle Analytics" -n FrontEnd
grep -R "عربي" -n FrontEnd
grep -R "Integration Configuration" -n FrontEnd
grep -R "Detected Intrusion Events" -n FrontEnd
```

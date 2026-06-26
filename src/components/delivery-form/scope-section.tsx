"use client";

import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/searchable-select";

type Option = { value: string; label: string };

interface ScopeSectionProps {
  revisionRounds: string;
  feedbackWindows: string;
  rushedProject: boolean;
  repeatClient: boolean;
  /** Options sourced live from ClickUp's field definitions. When provided they
   *  replace the fallbacks below, so adding a ClickUp option needs no code
   *  change. */
  revisionOptions?: Option[];
  feedbackWindowOptions?: Option[];
  onRevisionRoundsChange: (value: string) => void;
  onFeedbackWindowsChange: (value: string) => void;
  onRushedProjectChange: (value: boolean) => void;
  onRepeatClientChange: (value: boolean) => void;
}

// Fallbacks used only when ClickUp options aren't available (e.g. API failure).
const fallbackRevisionOptions: Option[] = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
];

const fallbackFeedbackWindowOptions: Option[] = [
  { value: "Same day", label: "Same day" },
  { value: "24 Hours", label: "24 Hours" },
  { value: "48 Hours", label: "48 Hours" },
];

// Guarantee the currently-selected value is always a selectable option, so a
// real ClickUp value never renders as a blank select even if the options list
// is momentarily incomplete.
function withCurrentValue(options: Option[], current: string): Option[] {
  if (!current || options.some((o) => o.value === current)) return options;
  return [...options, { value: current, label: current }];
}

export function ScopeSection({
  revisionRounds,
  feedbackWindows,
  rushedProject,
  repeatClient,
  revisionOptions,
  feedbackWindowOptions,
  onRevisionRoundsChange,
  onFeedbackWindowsChange,
  onRushedProjectChange,
  onRepeatClientChange,
}: ScopeSectionProps) {
  const revisionOpts = withCurrentValue(
    revisionOptions?.length ? revisionOptions : fallbackRevisionOptions,
    revisionRounds
  );
  const feedbackOpts = withCurrentValue(
    feedbackWindowOptions?.length
      ? feedbackWindowOptions
      : fallbackFeedbackWindowOptions,
    feedbackWindows
  );
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Scope</Label>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">
            Revision Rounds
          </Label>
          <SearchableSelect
            options={revisionOpts}
            value={revisionRounds}
            onValueChange={onRevisionRoundsChange}
            placeholder="Select..."
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            Feedback Windows
          </Label>
          <SearchableSelect
            options={feedbackOpts}
            value={feedbackWindows}
            onValueChange={onFeedbackWindowsChange}
            placeholder="Select..."
          />
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={repeatClient}
            onChange={(e) => onRepeatClientChange(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[#6AC387]"
          />
          <span className="text-sm flex items-center gap-1.5">
            <span>🔁</span> Repeat Client
            <span className="text-xs text-muted-foreground font-normal">
              — removes explainer sections for returning clients
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rushedProject}
            onChange={(e) => onRushedProjectChange(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[#6AC387]"
          />
          <span className="text-sm flex items-center gap-1.5">
            <span>🚨</span> Rushed Project
            <span className="text-xs text-muted-foreground font-normal">
              — adds strict feedback deadline notice
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

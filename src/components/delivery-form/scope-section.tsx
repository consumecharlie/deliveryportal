"use client";

import { Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/searchable-select";

interface ScopeSectionProps {
  revisionRounds: string;
  feedbackWindows: string;
  rushedProject: boolean;
  repeatClient: boolean;
  onRevisionRoundsChange: (value: string) => void;
  onFeedbackWindowsChange: (value: string) => void;
  onRushedProjectChange: (value: boolean) => void;
  onRepeatClientChange: (value: boolean) => void;
  showAddonButton?: boolean;
  addonProjectName?: string;
  onAddProject?: () => void;
  onRemoveAddon?: () => void;
}

const revisionOptions = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
];

const feedbackWindowOptions = [
  { value: "Same day", label: "Same day" },
  { value: "24 Hours", label: "24 Hours" },
  { value: "48 Hours", label: "48 Hours" },
];

export function ScopeSection({
  revisionRounds,
  feedbackWindows,
  rushedProject,
  repeatClient,
  onRevisionRoundsChange,
  onFeedbackWindowsChange,
  onRushedProjectChange,
  onRepeatClientChange,
  showAddonButton,
  addonProjectName,
  onAddProject,
  onRemoveAddon,
}: ScopeSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Scope</Label>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">
            Revision Rounds
          </Label>
          <SearchableSelect
            options={revisionOptions}
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
            options={feedbackWindowOptions}
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
        {showAddonButton && !addonProjectName && (
          <button
            type="button"
            onClick={onAddProject}
            className="flex items-center gap-1.5 text-sm text-[#6AC387] hover:text-[#5aad74] transition-colors mt-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Project (same contact)
          </button>
        )}
        {addonProjectName && (
          <div className="flex items-center gap-2 mt-1 rounded-md border border-[#6AC387]/30 bg-[#6AC387]/5 px-3 py-1.5">
            <span className="text-sm">
              📎 Combined with <strong>{addonProjectName}</strong>
            </span>
            <button
              type="button"
              onClick={onRemoveAddon}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

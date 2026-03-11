"use client";

import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/searchable-select";

interface ScopeSectionProps {
  revisionRounds: string;
  feedbackWindows: string;
  onRevisionRoundsChange: (value: string) => void;
  onFeedbackWindowsChange: (value: string) => void;
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
  onRevisionRoundsChange,
  onFeedbackWindowsChange,
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
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LINK_VARIABLE_MAP } from "@/lib/custom-field-ids";

interface ReviewLinksSectionProps {
  requiredFields: string[];
  reviewLinks: Record<string, string>;
  extraLinks: Array<{ url: string; label: string }>;
  onReviewLinkChange: (field: string, value: string) => void;
  onAddExtraLink: () => void;
  onExtraLinkChange: (index: number, field: "url" | "label", value: string) => void;
  onRemoveExtraLink: (index: number) => void;
}

export function ReviewLinksSection({
  requiredFields,
  reviewLinks,
  extraLinks,
  onReviewLinkChange,
  onAddExtraLink,
  onExtraLinkChange,
  onRemoveExtraLink,
}: ReviewLinksSectionProps) {
  // The flex link field should be shown first when the user adds a link,
  // before any dynamic extra links. It only shows via Add if the template
  // doesn't already include it in requiredFields.
  const flexAlreadyRequired = requiredFields.includes("flexLink");
  const flexHasValue = !!reviewLinks.flexLink;

  // Track whether the user has activated the flex link field via Add
  const [flexLinkActive, setFlexLinkActive] = useState(flexHasValue && !flexAlreadyRequired);

  const handleAddClick = useCallback(() => {
    // If flex link isn't already shown (via template or user), show it first
    if (!flexAlreadyRequired && !flexLinkActive) {
      setFlexLinkActive(true);
    } else {
      // Otherwise add a dynamic extra link
      onAddExtraLink();
    }
  }, [flexAlreadyRequired, flexLinkActive, onAddExtraLink]);

  const handleRemoveFlexLink = useCallback(() => {
    setFlexLinkActive(false);
    onReviewLinkChange("flexLink", "");
  }, [onReviewLinkChange]);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Review Links</Label>

      {/* Template-driven link fields */}
      {requiredFields.map((varName) => {
        const meta = LINK_VARIABLE_MAP[varName];
        if (!meta) return null;
        const value = reviewLinks[varName] ?? "";

        return (
          <div key={varName} className="flex items-center gap-2">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                {meta.label}
              </Label>
              <Input
                type="url"
                placeholder={`https://...`}
                value={value}
                onChange={(e) => onReviewLinkChange(varName, e.target.value)}
              />
            </div>
            {value && (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        );
      })}

      {requiredFields.length === 0 && !flexLinkActive && (
        <p className="text-sm text-muted-foreground">
          No link fields in the current template.
        </p>
      )}

      {/* Flexible Link — shown when user clicks Add (before extra links) */}
      {flexLinkActive && !flexAlreadyRequired && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">
              Flexible Link
              <span className="ml-1 text-[10px] text-blue-500">(syncs to ClickUp)</span>
            </Label>
            <Input
              type="url"
              placeholder="https://..."
              value={reviewLinks.flexLink ?? ""}
              onChange={(e) => onReviewLinkChange("flexLink", e.target.value)}
            />
          </div>
          {reviewLinks.flexLink && (
            <a
              href={reviewLinks.flexLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="mb-0.5"
            onClick={handleRemoveFlexLink}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Extra links (dynamic, non-ClickUp) */}
      {extraLinks.map((link, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Link Text</Label>
            <Input
              placeholder="e.g., View Storyboard Revisions"
              value={link.label}
              onChange={(e) => onExtraLinkChange(index, "label", e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">URL</Label>
            <Input
              type="url"
              placeholder="https://..."
              value={link.url}
              onChange={(e) => onExtraLinkChange(index, "url", e.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemoveExtraLink(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={handleAddClick}>
        <Plus className="mr-1 h-4 w-4" />
        Add Review Link
      </Button>
    </div>
  );
}

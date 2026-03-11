"use client";

import { Label } from "@/components/ui/label";
import { RichTextEditor, type MentionItem } from "@/components/shared/rich-text-editor";

interface VersionNotesSectionProps {
  value: string;
  onChange: (value: string) => void;
  mentionItems?: MentionItem[];
}

export function VersionNotesSection({
  value,
  onChange,
  mentionItems,
}: VersionNotesSectionProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Version Notes</Label>
      <RichTextEditor
        content={value}
        onChange={onChange}
        placeholder="Enter version notes for the client... Use @ to mention someone"
        outputFormat="markdown"
        showToolbar={true}
        minHeight="100px"
        mentionItems={mentionItems}
      />
    </div>
  );
}

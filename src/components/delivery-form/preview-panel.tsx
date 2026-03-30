"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, RotateCcw, Eye, Check, ChevronDown, FileEdit } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { SlackValidationPanel } from "@/components/shared/slack-validation-panel";
import type { MentionItem } from "@/components/shared/rich-text-editor";
import type { SlackLintError } from "@/lib/slack-lint";
import type { ProjectContact } from "@/lib/types";

interface PreviewPanelProps {
  emailContent: string;
  slackContent: string;
  subjectLine: string;
  primaryEmail: string;
  senderEmail: string;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onEmailContentChange: (content: string) => void;
  onSlackContentChange: (content: string) => void;
  onSubjectLineChange: (subject: string) => void;
  onResetToTemplate: () => void;
  contacts: ProjectContact[];
  mentionItems?: MentionItem[];
  showEmail?: boolean;
  showSlack?: boolean;
  templateTaskId?: string;
  deliverableType?: string;
  onSlackLintResult?: (errors: SlackLintError[]) => void;
}

/**
 * Pre-process Slack markdown for display in TipTap.
 * Converts <@userId> mention tokens into TipTap mention markdown syntax
 * @[DisplayName](userId) so TipTap renders them as styled mention chips.
 * The mention data (userId) is preserved through the edit round-trip.
 */
function prepareSlackMarkdownForPreview(
  markdown: string,
  contacts: ProjectContact[]
): string {
  return markdown.replace(/<@([A-Z0-9]+)>/g, (_match, userId: string) => {
    const contact = contacts.find((c) => c.slackUserId === userId);
    // Prefer Slack handle (e.g. "emily.gardiner"), fall back to name
    let displayName = contact?.slackHandle ?? contact?.name ?? userId;
    // Strip leading @ since TipTap's mention CSS adds it via ::before
    displayName = displayName.replace(/^@/, "");
    return `@[${displayName}](${userId})`;
  });
}

export function PreviewPanel({
  emailContent,
  slackContent,
  subjectLine,
  primaryEmail,
  senderEmail,
  isEditMode,
  onToggleEditMode,
  onEmailContentChange,
  onSlackContentChange,
  onSubjectLineChange,
  onResetToTemplate,
  contacts,
  mentionItems,
  showEmail = true,
  showSlack = true,
  templateTaskId,
  deliverableType,
  onSlackLintResult,
}: PreviewPanelProps) {
  const router = useRouter();
  // Default to whichever channel is active
  const defaultTab = showEmail ? "email" : "slack";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Track whether user has made edits since entering edit mode
  const [hasEdited, setHasEdited] = useState(false);
  const [showTemplateWarning, setShowTemplateWarning] = useState(false);
  const prevEditMode = useRef(isEditMode);

  // Reset hasEdited when entering edit mode
  useEffect(() => {
    if (isEditMode && !prevEditMode.current) {
      setHasEdited(false);
    }
    prevEditMode.current = isEditMode;
  }, [isEditMode]);

  // Wrap onChange handlers to detect edits
  const handleEmailChange = useCallback(
    (content: string) => {
      setHasEdited(true);
      onEmailContentChange(content);
    },
    [onEmailContentChange]
  );

  const handleSlackChange = useCallback(
    (content: string) => {
      setHasEdited(true);
      onSlackContentChange(content);
    },
    [onSlackContentChange]
  );

  const handleSubjectChange = useCallback(
    (value: string) => {
      setHasEdited(true);
      onSubjectLineChange(value);
    },
    [onSubjectLineChange]
  );

  // If the current tab is hidden by mode change, switch to the other
  const effectiveTab =
    (activeTab === "email" && !showEmail) ? "slack" :
    (activeTab === "slack" && !showSlack) ? "email" :
    activeTab;

  return (
    <div className="sticky top-20">
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">Preview</span>
          <div className="flex gap-1">
            {isEditMode && (
              <Button variant="ghost" size="sm" onClick={onResetToTemplate}>
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset
              </Button>
            )}
            {isEditMode ? (
              <Button
                variant={hasEdited ? "default" : "ghost"}
                size="sm"
                onClick={onToggleEditMode}
              >
                {hasEdited ? (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Save edits
                  </>
                ) : (
                  <>
                    <Eye className="mr-1 h-3 w-3" />
                    Preview
                  </>
                )}
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onToggleEditMode}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit Message
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (templateTaskId) {
                        setShowTemplateWarning(true);
                      } else {
                        router.push(
                          `/templates/new${deliverableType ? `?type=${encodeURIComponent(deliverableType)}` : ""}`
                        );
                      }
                    }}
                  >
                    <FileEdit className="mr-2 h-3.5 w-3.5" />
                    {templateTaskId ? "Edit Template" : "Create Template"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <Tabs value={effectiveTab} onValueChange={setActiveTab}>
          {/* Only show tab selector when both channels are active */}
          {showEmail && showSlack && (
            <div className="border-b px-4">
              <TabsList className="h-9">
                <TabsTrigger value="email" className="text-xs">
                  Email Preview
                </TabsTrigger>
                <TabsTrigger value="slack" className="text-xs">
                  Slack Preview
                </TabsTrigger>
              </TabsList>
            </div>
          )}
          {/* Single-channel header when only one is active */}
          {showEmail && !showSlack && (
            <div className="border-b px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">Email Preview</span>
            </div>
          )}
          {showSlack && !showEmail && (
            <div className="border-b px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">Slack Preview</span>
            </div>
          )}

          <TabsContent value="email" className="m-0">
            {/* Subject line */}
            <div className="border-b px-4 py-2">
              {isEditMode ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Subject
                  </Label>
                  <Input
                    value={subjectLine}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ) : (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Subject:{" "}
                  </span>
                  <span className="text-sm font-medium">{subjectLine}</span>
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                To: {primaryEmail} &middot; From: {senderEmail}
              </div>
            </div>

            {/* Email body */}
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {isEditMode ? (
                <RichTextEditor
                  key="email-edit"
                  content={emailContent}
                  onChange={handleEmailChange}
                  placeholder="Edit email content... Use @ to mention someone"
                  outputFormat="markdown"
                  showToolbar={true}
                  minHeight="300px"
                  mentionItems={mentionItems}
                />
              ) : (
                <RichTextEditor
                  key="email-preview"
                  content={emailContent}
                  onChange={() => {}}
                  outputFormat="markdown"
                  showToolbar={false}
                  editable={false}
                  minHeight="200px"
                  mentionItems={mentionItems}
                  className="border-none ring-0 focus-within:ring-0 focus-within:ring-offset-0"
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="slack" className="m-0">
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {isEditMode ? (
                <RichTextEditor
                  key="slack-edit"
                  content={prepareSlackMarkdownForPreview(slackContent, contacts)}
                  onChange={handleSlackChange}
                  placeholder="Edit Slack message... Use @ to mention someone"
                  outputFormat="markdown"
                  showToolbar={true}
                  minHeight="300px"
                  mentionItems={mentionItems}
                />
              ) : (
                <RichTextEditor
                  key="slack-preview"
                  content={prepareSlackMarkdownForPreview(slackContent, contacts)}
                  onChange={() => {}}
                  outputFormat="markdown"
                  showToolbar={false}
                  editable={false}
                  minHeight="200px"
                  mentionItems={mentionItems}
                  className="border-none ring-0 focus-within:ring-0 focus-within:ring-offset-0"
                />
              )}
            </div>
            {showSlack && (
              <div className="border-t px-4 py-3">
                <SlackValidationPanel
                  markdown={slackContent}
                  onLintResult={onSlackLintResult}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Template edit confirmation dialog */}
      <AlertDialog
        open={showTemplateWarning}
        onOpenChange={setShowTemplateWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Template</AlertDialogTitle>
            <AlertDialogDescription>
              This will take you to the template editor. Any changes you make
              will apply to all future deliveries using this template, not just
              this one. Unsaved changes to this delivery will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => router.push(`/templates/${templateTaskId}`)}
            >
              Edit Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Save, Send, Loader2, FlaskConical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { DeliveryFormState, MergedContent } from "@/lib/types";
import type { SlackLintError } from "@/lib/slack-lint";

interface SendBarProps {
  taskId: string;
  formState: DeliveryFormState;
  mergedContent: MergedContent | null;
  primaryEmail: string;
  ccEmails: string;
  senderEmail: string;
  postToSlack: boolean;
  slackChannelId: string;
  originalDeliverableType: string;
  listId: string;
  testMode?: boolean;
  testEmail?: string;
  taskMeta?: {
    clientName?: string;
    projectName?: string;
    department?: string;
    slackChannelName?: string;
  };
  slackLintErrors?: SlackLintError[];
  adhocMode?: boolean;
  adhocListId?: string;
  adhocDeliverableType?: string;
  adhocDepartment?: string;
  addonListId?: string;
  addonDeliverableType?: string;
  addonDepartment?: string;
  addonReviewLinks?: Record<string, string>;
  addonProjectName?: string;
}

export function SendBar({
  taskId,
  formState,
  mergedContent,
  primaryEmail,
  ccEmails,
  senderEmail,
  postToSlack,
  slackChannelId,
  originalDeliverableType,
  listId,
  testMode,
  testEmail,
  taskMeta,
  slackLintErrors,
  adhocMode,
  adhocListId,
  adhocDeliverableType,
  adhocDepartment,
  addonListId,
  addonDeliverableType,
  addonDepartment,
  addonReviewLinks,
  addonProjectName,
}: SendBarProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showLintWarning, setShowLintWarning] = useState(false);
  const [showConfirmAfterLint, setShowConfirmAfterLint] = useState(false);

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });

      if (!res.ok) throw new Error("Failed to save draft");

      toast.success("Draft saved", {
        description: "Fields written to ClickUp and draft saved.",
      });
    } catch {
      toast.error("Failed to save draft");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      const endpoint = adhocMode
        ? "/api/deliverable/adhoc-send"
        : `/api/tasks/${taskId}/send`;

      const addonFields = addonListId
        ? {
            addonListId,
            addonDeliverableType,
            addonDepartment,
            addonReviewLinks,
            addonProjectName,
          }
        : {};

      const body = adhocMode
        ? {
            formState,
            mergedContent,
            primaryEmail,
            ccEmails,
            senderEmail,
            postToSlack,
            slackChannelId,
            originalDeliverableType,
            listId: adhocListId,
            deliverableType: adhocDeliverableType,
            department: adhocDepartment,
            taskMeta,
            ...(testMode ? { testMode: true, testEmail } : {}),
            ...addonFields,
          }
        : {
            formState,
            mergedContent,
            primaryEmail,
            ccEmails,
            senderEmail,
            postToSlack,
            slackChannelId,
            originalDeliverableType,
            listId,
            taskMeta,
            ...(testMode ? { testMode: true, testEmail } : {}),
            ...addonFields,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to send");
      }

      const result = await res.json();

      if (testMode) {
        toast.success("Test delivery sent!", {
          description: postToSlack
            ? "Slack message sent to #delivery-testing."
            : `Email sent to ${testEmail} (no CCs). Subject prefixed with [TEST].`,
          duration: 8000,
        });
      } else {
        toast.success("Delivery sent!", {
          description: postToSlack
            ? "Slack message posted and task marked complete."
            : "Email draft created, Slack message posted, and task marked complete.",
        });

        // In adhoc mode, use the new task ID from the response
        const resultTaskId = adhocMode ? result.taskId : taskId;

        const successParams = new URLSearchParams({
          to: primaryEmail,
          cc: ccEmails,
          from: senderEmail,
          subject:
            formState.editedSubjectLine ?? mergedContent?.subjectLine ?? "",
          slack: postToSlack ? "true" : "false",
          ...(result.deliveryId ? { deliveryId: result.deliveryId } : {}),
        });
        router.push(`/deliverable/${resultTaskId}/sent?${successParams.toString()}`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send delivery"
      );
    } finally {
      setIsSending(false);
    }
  };

  // Email mode requires recipient + sender; Slack mode just needs content + channel
  const isReady =
    !!mergedContent &&
    (postToSlack ? !!slackChannelId : !!primaryEmail && !!senderEmail);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 border-t backdrop-blur supports-[backdrop-filter]:bg-background/60 ${
        testMode
          ? "border-amber-300 bg-amber-50/95 dark:border-amber-700 dark:bg-amber-950/95"
          : "bg-background/95"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {!isReady &&
            (!mergedContent
              ? "Missing or empty template — create or edit the template first"
              : postToSlack
                ? "Missing Slack channel"
                : "Missing recipient or sender email")}
        </div>
        <div className="flex items-center gap-3">
          {!adhocMode && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSaving || isSending}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Draft
            </Button>
          )}

          {/* Send button — shows lint warning if errors exist, otherwise normal confirm */}
          {slackLintErrors && slackLintErrors.length > 0 ? (
            <>
              <Button
                disabled={!isReady || isSending}
                onClick={() => setShowLintWarning(true)}
                className={
                  testMode
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : undefined
                }
              >
                {isSending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : testMode ? (
                  <FlaskConical className="mr-2 h-4 w-4" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {testMode ? "Test Send" : "Send"}
              </Button>

              {/* Lint warning dialog */}
              <AlertDialog open={showLintWarning} onOpenChange={setShowLintWarning}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      Slack Formatting Issues
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3 text-sm">
                        <p>
                          The Slack message has {slackLintErrors.length} formatting{" "}
                          {slackLintErrors.length === 1 ? "issue" : "issues"} that
                          may not render correctly:
                        </p>
                        <ul className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                          {slackLintErrors.map((err, i) => (
                            <li
                              key={i}
                              className="text-xs text-amber-700 dark:text-amber-400"
                            >
                              <span className="font-mono">Line {err.line}:</span>{" "}
                              {err.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Go Back</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setShowLintWarning(false);
                        setShowConfirmAfterLint(true);
                      }}
                    >
                      Send Anyway
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Normal confirm dialog (shown after dismissing lint warning) */}
              <AlertDialog open={showConfirmAfterLint} onOpenChange={setShowConfirmAfterLint}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      {testMode && (
                        <FlaskConical className="h-5 w-5 text-amber-600" />
                      )}
                      {testMode ? "Test Send" : "Send Delivery"}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2 text-sm">
                        {testMode ? (
                          <>
                            <p>
                              This sends through the full n8n pipeline with
                              overridden recipients. No ClickUp changes will be
                              made.
                            </p>
                            <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-1 dark:border-amber-800 dark:bg-amber-950">
                              {postToSlack ? (
                                <>
                                  <div>
                                    <strong>Slack:</strong> #delivery-testing
                                  </div>
                                  <div>
                                    <strong>Email:</strong>{" "}
                                    <span className="text-muted-foreground">
                                      Not sent (Slack mode)
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <strong>To:</strong> {testEmail}
                                  </div>
                                  <div>
                                    <strong>CC:</strong>{" "}
                                    <span className="text-muted-foreground">
                                      None
                                    </span>
                                  </div>
                                  <div>
                                    <strong>Subject:</strong> [TEST]{" "}
                                    {formState.editedSubjectLine ??
                                      mergedContent?.subjectLine ??
                                      ""}
                                  </div>
                                </>
                              )}
                              <div>
                                <strong>ClickUp:</strong>{" "}
                                <span className="text-muted-foreground">
                                  No changes
                                </span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <p>
                              {postToSlack
                                ? "This will post a message to Slack."
                                : "This will create an email draft and post to Slack."}
                            </p>
                            <div className="rounded border p-3 space-y-1">
                              {!postToSlack && (
                                <>
                                  <div>
                                    <strong>To:</strong> {primaryEmail}
                                  </div>
                                  {ccEmails && (
                                    <div>
                                      <strong>CC:</strong> {ccEmails}
                                    </div>
                                  )}
                                  <div>
                                    <strong>From:</strong> {senderEmail}
                                  </div>
                                </>
                              )}
                              <div>
                                <strong>Slack:</strong>{" "}
                                {postToSlack ? "Yes" : "No"}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleSend}
                      className={
                        testMode
                          ? "bg-amber-600 hover:bg-amber-700"
                          : undefined
                      }
                    >
                      {testMode ? "Confirm Test Send" : "Confirm & Send"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={!isReady || isSending}
                  className={
                    testMode
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : undefined
                  }
                >
                  {isSending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : testMode ? (
                    <FlaskConical className="mr-2 h-4 w-4" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {testMode ? "Test Send" : "Send"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    {testMode && (
                      <FlaskConical className="h-5 w-5 text-amber-600" />
                    )}
                    {testMode ? "Test Send" : "Send Delivery"}
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      {testMode ? (
                        <>
                          <p>
                            This sends through the full n8n pipeline with
                            overridden recipients. No ClickUp changes will be
                            made.
                          </p>
                          <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-1 dark:border-amber-800 dark:bg-amber-950">
                            {postToSlack ? (
                              <>
                                <div>
                                  <strong>Slack:</strong> #delivery-testing
                                </div>
                                <div>
                                  <strong>Email:</strong>{" "}
                                  <span className="text-muted-foreground">
                                    Not sent (Slack mode)
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <strong>To:</strong> {testEmail}
                                </div>
                                <div>
                                  <strong>CC:</strong>{" "}
                                  <span className="text-muted-foreground">
                                    None
                                  </span>
                                </div>
                                <div>
                                  <strong>Subject:</strong> [TEST]{" "}
                                  {formState.editedSubjectLine ??
                                    mergedContent?.subjectLine ??
                                    ""}
                                </div>
                              </>
                            )}
                            <div>
                              <strong>ClickUp:</strong>{" "}
                              <span className="text-muted-foreground">
                                No changes
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <p>
                            {postToSlack
                              ? "This will post a message to Slack."
                              : "This will create an email draft and post to Slack."}
                          </p>
                          <div className="rounded border p-3 space-y-1">
                            {!postToSlack && (
                              <>
                                <div>
                                  <strong>To:</strong> {primaryEmail}
                                </div>
                                {ccEmails && (
                                  <div>
                                    <strong>CC:</strong> {ccEmails}
                                  </div>
                                )}
                                <div>
                                  <strong>From:</strong> {senderEmail}
                                </div>
                              </>
                            )}
                            <div>
                              <strong>Slack:</strong>{" "}
                              {postToSlack ? "Yes" : "No"}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleSend}
                    className={
                      testMode
                        ? "bg-amber-600 hover:bg-amber-700"
                        : undefined
                    }
                  >
                    {testMode ? "Confirm Test Send" : "Confirm & Send"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}

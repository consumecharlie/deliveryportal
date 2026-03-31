"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Mail, MessageSquare, FlaskConical } from "lucide-react";
import { useAutoSave } from "@/hooks/use-auto-save";
import { Button } from "@/components/ui/button";
import { DepartmentBadge } from "@/components/dashboard/department-badge";
import { ReviewLinksSection } from "./review-links-section";
import { ScopeSection } from "./scope-section";
import { VersionNotesSection } from "./version-notes-section";
import { RecipientsSection } from "./recipients-section";
import { SenderSelect } from "./sender-select";
import { SlackChannelSection } from "./slack-channel-section";
import { Label } from "@/components/ui/label";
import { PreviewPanel } from "./preview-panel";
import { SendBar } from "./send-bar";
import { SearchableSelect } from "@/components/shared/searchable-select";
import {
  mergeTemplate,
  getRequiredLinkFields,
} from "@/lib/template-merge";
import { DEPARTMENT_CC_EMAILS } from "@/lib/custom-field-ids";
import type {
  TaskDetail,
  DeliverySnippetTemplate,
  DeliveryFormState,
  MergedContent,
  SlackChannel,
  SlackMember,
} from "@/lib/types";
import type { MentionItem } from "@/components/shared/rich-text-editor";
import type { SlackLintError } from "@/lib/slack-lint";

interface DeliveryFormProps {
  taskDetail: TaskDetail;
  adhocMode?: boolean;
  adhocListId?: string;
  adhocDeliverableType?: string;
  adhocDepartment?: string;
}

export function DeliveryForm({
  taskDetail,
  adhocMode,
  adhocListId,
  adhocDeliverableType,
  adhocDepartment,
}: DeliveryFormProps) {
  const { task, contacts, feedbackDeadline, template: initialTemplate } = taskDetail;
  const { data: session } = useSession();

  // ── Form state ──

  const [deliverableType, setDeliverableType] = useState(task.deliverableType);
  const [currentTemplate, setCurrentTemplate] =
    useState<DeliverySnippetTemplate | null>(initialTemplate);
  const [reviewLinks, setReviewLinks] = useState<Record<string, string>>({
    googleDeliverableLink: taskDetail.reviewLinks.googleDeliverableLink ?? "",
    frameReviewLink: taskDetail.reviewLinks.frameReviewLink ?? "",
    loomReviewLink: taskDetail.reviewLinks.loomReviewLink ?? "",
    animaticReviewLink: taskDetail.reviewLinks.animaticReviewLink ?? "",
    flexLink: taskDetail.reviewLinks.flexLink ?? "",
  });
  const [extraLinks, setExtraLinks] = useState<
    Array<{ url: string; label: string }>
  >([]);
  const [revisionRounds, setRevisionRounds] = useState(
    taskDetail.revisionRounds
  );
  const [feedbackWindows, setFeedbackWindows] = useState(
    taskDetail.feedbackWindows
  );
  const [versionNotes, setVersionNotes] = useState(taskDetail.versionNotes);
  const [rushedProject, setRushedProject] = useState(false);
  const [repeatClient, setRepeatClient] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState(
    taskDetail.slackChannelId ?? ""
  );
  const [editedEmailContent, setEditedEmailContent] = useState<string | null>(
    null
  );
  const [editedSubjectLine, setEditedSubjectLine] = useState<string | null>(
    null
  );
  const [editedSlackContent, setEditedSlackContent] = useState<string | null>(
    null
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [slackLintErrors, setSlackLintErrors] = useState<SlackLintError[]>([]);
  const [slackChannelName, setSlackChannelName] = useState<string>("");

  // ── Editable recipient fields ──
  const [editedToEmail, setEditedToEmail] = useState<string | null>(null);
  const [editedCcEmails, setEditedCcEmails] = useState<string | null>(null);
  const [editedSenderEmail, setEditedSenderEmail] = useState<string | null>(null);

  // ── Delivery mode (email or slack) ──
  // Auto-detect: if primary contact has a Slack user ID → slack, otherwise email
  const detectedMode = contacts.find((c) => c.role === "Primary")?.slackUserId
    ? "slack"
    : "email";
  const [deliveryMode, setDeliveryMode] = useState<"email" | "slack">(detectedMode);

  // ── Test mode ──
  const [testMode, setTestMode] = useState(false);
  const testEmail = session?.user?.email ?? "michael@consume-media.com";
  const testSlackChannelId = "C0AJF6GBPK9"; // #delivery-testing
  const [savedSlackChannelId, setSavedSlackChannelId] = useState<string | null>(null);
  const [savedToEmail, setSavedToEmail] = useState<string | null>(null);
  const [savedCcEmails, setSavedCcEmails] = useState<string | null>(null);

  const handleTestModeToggle = useCallback(() => {
    setTestMode((prev) => {
      if (!prev) {
        // Entering test mode — save current values and override
        setSavedSlackChannelId(slackChannelId);
        setSavedToEmail(editedToEmail);
        setSavedCcEmails(editedCcEmails);
        setSlackChannelId(testSlackChannelId);
        setEditedToEmail(testEmail);
        setEditedCcEmails("");
      } else {
        // Leaving test mode — restore original values
        setSlackChannelId(savedSlackChannelId ?? taskDetail.slackChannelId ?? "");
        setEditedToEmail(savedToEmail);
        setEditedCcEmails(savedCcEmails);
      }
      return !prev;
    });
  }, [slackChannelId, editedToEmail, editedCcEmails, savedSlackChannelId, savedToEmail, savedCcEmails, taskDetail.slackChannelId, testEmail, testSlackChannelId]);

  const showEmail = deliveryMode === "email";
  const showSlack = deliveryMode === "slack";

  // ── Fetch template when deliverable type changes ──

  const { data: fetchedTemplate } = useQuery<DeliverySnippetTemplate>({
    queryKey: ["template", deliverableType],
    queryFn: async () => {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(deliverableType)}`
      );
      if (!res.ok) throw new Error("Template not found");
      return res.json();
    },
    enabled: deliverableType !== task.deliverableType,
    staleTime: 5 * 60_000,
  });

  // Use fetched template if type changed, otherwise initial
  const activeTemplate = fetchedTemplate ?? currentTemplate;

  // ── Fetch allowed senders (for From dropdown) ──

  const { data: fieldOptionsData } = useQuery<{
    sender: Array<{
      id: number;
      username: string;
      email: string;
      profilePicture?: string;
      initials: string;
    }>;
  }>({
    queryKey: ["field-options-senders"],
    queryFn: async () => {
      const res = await fetch("/api/templates/field-options");
      if (!res.ok) throw new Error("Failed to fetch field options");
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  const senderOptions = fieldOptionsData?.sender ?? [];

  // ── Determine which link fields to show ──

  const requiredLinkFields = useMemo(() => {
    if (!activeTemplate?.snippet) return [];
    return getRequiredLinkFields(activeTemplate.snippet);
  }, [activeTemplate?.snippet]);

  // ── Build merged preview ──

  const mergedContent: MergedContent | null = useMemo(() => {
    if (!activeTemplate?.snippet) return null;

    const primaryContact = contacts.find((c) => c.role === "Primary");
    const postToSlack = !!primaryContact?.slackUserId;

    return mergeTemplate(activeTemplate.snippet, activeTemplate.subjectLine, {
      contacts,
      projectName: task.projectName,
      versionNotes,
      revisionRounds,
      feedbackWindows,
      nextFeedbackDeadline: feedbackDeadline?.formattedDate ?? "",
      googleDeliverableLink: reviewLinks.googleDeliverableLink,
      frameReviewLink: reviewLinks.frameReviewLink,
      animaticReviewLink: reviewLinks.animaticReviewLink,
      loomReviewLink: reviewLinks.loomReviewLink,
      flexLink: reviewLinks.flexLink,
      projectPlanLink: taskDetail.projectPlanLink ?? undefined,
      extraLinks,
      rushedProject,
      repeatClient,
    });
  }, [
    activeTemplate,
    contacts,
    task.projectName,
    versionNotes,
    revisionRounds,
    feedbackWindows,
    feedbackDeadline,
    reviewLinks,
    taskDetail.projectPlanLink,
    extraLinks,
    rushedProject,
    repeatClient,
  ]);

  // ── Recipient logic ──

  const primaryContact = contacts.find((c) => c.role === "Primary");
  const ccContacts = contacts.filter(
    (c) => c.role !== "Primary" && c.role !== "Log"
  );
  const deptCcEmail = DEPARTMENT_CC_EMAILS[task.department] ?? "";
  const ccEmails = [
    ...ccContacts.map((c) => c.email).filter(Boolean),
    deptCcEmail,
  ]
    .filter(Boolean)
    .join(", ");
  const postToSlack = !!primaryContact?.slackUserId;

  // Display values: use edited overrides if set, otherwise defaults
  const displayToEmail = editedToEmail ?? primaryContact?.email ?? "";
  const displayCcEmails = editedCcEmails ?? ccEmails;
  const displaySenderEmail = editedSenderEmail ?? activeTemplate?.senderEmail ?? "";

  // ── Full deliverable type options from ClickUp field definition ──

  const { data: deliverableTypesData } = useQuery<{
    options: Array<{ id: string; name: string; orderindex: number }>;
  }>({
    queryKey: ["deliverable-types"],
    queryFn: async () => {
      const res = await fetch("/api/deliverable-types");
      if (!res.ok) throw new Error("Failed to fetch deliverable types");
      return res.json();
    },
    staleTime: 30 * 60_000, // 30 min — these rarely change
  });

  // ── Fetch Slack channel members for @mention autocomplete ──
  // When a channel is selected, fetch its members instead of the full workspace

  const { data: slackMembersData } = useQuery<{
    members: SlackMember[];
  }>({
    queryKey: ["slack-channel-members", slackChannelId],
    queryFn: async () => {
      if (!slackChannelId) {
        // Fallback: fetch all workspace members if no channel selected
        const res = await fetch("/api/slack/members");
        if (!res.ok) throw new Error("Failed to fetch Slack members");
        return res.json();
      }
      const res = await fetch(
        `/api/slack/channel-members?channelId=${encodeURIComponent(slackChannelId)}`
      );
      if (!res.ok) throw new Error("Failed to fetch channel members");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Build mention items: project contacts first (with Slack data), then Slack members
  const mentionItems: MentionItem[] = useMemo(() => {
    const items: MentionItem[] = [];
    const seenIds = new Set<string>();

    // Tier 1: Project contacts (from task detail)
    for (const contact of contacts) {
      const id = contact.slackUserId ?? contact.email;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      items.push({
        id,
        label: contact.name,
        slackUserId: contact.slackUserId,
        slackHandle: contact.slackHandle,
        email: contact.email,
        source: "project",
      });
    }

    // Tier 2: All Slack workspace members
    const slackMembers = slackMembersData?.members ?? [];
    for (const member of slackMembers) {
      if (seenIds.has(member.id)) continue;
      seenIds.add(member.id);
      items.push({
        id: member.id,
        label: member.displayName || member.realName || member.name,
        slackUserId: member.id,
        slackHandle: member.name,
        source: "slack",
      });
    }

    return items;
  }, [contacts, slackMembersData]);

  const deliverableTypeOptions = useMemo(() => {
    const options = deliverableTypesData?.options ?? [];
    if (options.length > 0) {
      return options.map((o) => ({ value: o.name, label: o.name }));
    }
    // Fallback: at minimum show the current type
    return [{ value: deliverableType, label: deliverableType || "Not set" }];
  }, [deliverableTypesData, deliverableType]);

  const handleDeliverableTypeChange = useCallback(
    (newType: string) => {
      setDeliverableType(newType);
      // Reset edit mode when template changes
      setEditedEmailContent(null);
      setEditedSubjectLine(null);
      setIsEditMode(false);
    },
    []
  );

  const handleReviewLinkChange = useCallback(
    (field: string, value: string) => {
      setReviewLinks((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleAddExtraLink = useCallback(() => {
    setExtraLinks((prev) => [...prev, { url: "", label: "" }]);
  }, []);

  const handleExtraLinkChange = useCallback(
    (index: number, field: "url" | "label", value: string) => {
      setExtraLinks((prev) =>
        prev.map((link, i) =>
          i === index ? { ...link, [field]: value } : link
        )
      );
    },
    []
  );

  const handleRemoveExtraLink = useCallback((index: number) => {
    setExtraLinks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleToggleEditMode = useCallback(() => {
    // NOTE: We intentionally do NOT pre-initialize editedEmailContent here.
    // TipTap's editor receives its content from displayEmailContent which
    // falls through to mergedContent when editedEmailContent is null.
    // This keeps the preview reactive to form input changes (review links,
    // version notes, etc.) until the user actually types in the editor.
    setIsEditMode((prev) => !prev);
  }, []);

  const handleResetToTemplate = useCallback(() => {
    setEditedEmailContent(null);
    setEditedSubjectLine(null);
    setEditedSlackContent(null);
    setIsEditMode(false);
  }, []);

  // Final content to display/send
  const displayEmailContent =
    editedEmailContent ?? mergedContent?.emailContent ?? "";
  const displaySubjectLine =
    editedSubjectLine ?? mergedContent?.subjectLine ?? "";
  const displaySlackContent =
    editedSlackContent ?? mergedContent?.slackContent ?? "";

  // Build the form state for save/send
  const formState: DeliveryFormState = {
    deliverableType,
    reviewLinks,
    extraLinks: extraLinks.filter((l) => l.url && l.label),
    revisionRounds,
    feedbackWindows,
    versionNotes,
    slackChannelId,
    editedEmailContent,
    editedSlackContent,
    editedSubjectLine,
    editedToEmail,
    editedCcEmails,
    editedSenderEmail,
  };

  // ── Auto-save (every 30s, no ClickUp write) ──
  // Disabled in adhoc mode since there's no real task ID to save against
  useAutoSave({
    taskId: task.id,
    formState,
    savedBy: session?.user?.email ?? "portal-user",
    taskMeta: {
      taskName: task.name,
      clientName: task.clientName,
      projectName: task.projectName,
    },
    enabled: !adhocMode,
  });

  // ── Restore draft on mount ──
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    if (draftLoaded) return;
    let cancelled = false;

    async function loadDraft() {
      try {
        const res = await fetch(`/api/drafts/${task.id}`);
        if (!res.ok) return;
        const { draft } = await res.json();
        if (!draft?.formData || cancelled) return;

        const saved = draft.formData as DeliveryFormState;
        // Only restore if the draft has meaningful data
        if (saved.deliverableType) setDeliverableType(saved.deliverableType);
        if (saved.versionNotes) setVersionNotes(saved.versionNotes);
        if (saved.slackChannelId) setSlackChannelId(saved.slackChannelId);
        if (saved.revisionRounds) setRevisionRounds(saved.revisionRounds);
        if (saved.feedbackWindows) setFeedbackWindows(saved.feedbackWindows);
        if (saved.reviewLinks) {
          setReviewLinks((prev) => ({ ...prev, ...saved.reviewLinks }));
        }
        if (saved.extraLinks?.length) setExtraLinks(saved.extraLinks);
        if (saved.editedEmailContent) setEditedEmailContent(saved.editedEmailContent);
        if (saved.editedSubjectLine) setEditedSubjectLine(saved.editedSubjectLine);
        if (saved.editedSlackContent) setEditedSlackContent(saved.editedSlackContent);
        if (saved.editedEmailContent || saved.editedSubjectLine || saved.editedSlackContent) setIsEditMode(true);
        if (saved.editedToEmail) setEditedToEmail(saved.editedToEmail);
        if (saved.editedCcEmails) setEditedCcEmails(saved.editedCcEmails);
        if (saved.editedSenderEmail) setEditedSenderEmail(saved.editedSenderEmail);
      } catch {
        // Silent — draft restoration is best-effort
      } finally {
        if (!cancelled) setDraftLoaded(true);
      }
    }

    loadDraft();
    return () => { cancelled = true; };
  }, [task.id, draftLoaded]);

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{task.name}</h1>
            <DepartmentBadge department={task.department} />
          </div>
          <p className="text-sm text-muted-foreground">
            {task.clientName} / {task.projectName}
          </p>
        </div>
        {/* Delivery mode toggle */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <button
            type="button"
            onClick={() => setDeliveryMode("email")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              deliveryMode === "email"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
          <button
            type="button"
            onClick={() => setDeliveryMode("slack")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              deliveryMode === "slack"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Slack
          </button>
        </div>

        {/* Test mode toggle */}
        <button
          type="button"
          onClick={handleTestModeToggle}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            testMode
              ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-400"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Test Mode
        </button>

        <a
          href={task.clickUpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Test mode banner */}
      {testMode && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-700 dark:bg-amber-950">
          <FlaskConical className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-amber-800 dark:text-amber-300">
            <strong>Test mode active.</strong>
            {showSlack
              ? " Slack will send to #delivery-testing."
              : ` Email will send to ${testEmail} with no CCs.`}
            {" "}No ClickUp changes. Task won't be marked complete.
          </span>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left: Editor */}
        <div className="col-span-3 space-y-6">
          {/* Deliverable Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Deliverable Type</label>
            <SearchableSelect
              options={deliverableTypeOptions}
              value={deliverableType}
              onValueChange={handleDeliverableTypeChange}
              placeholder="Select deliverable type"
              searchPlaceholder="Search types..."
            />
            {activeTemplate && (
              <p className="text-xs text-muted-foreground">
                Using template: {activeTemplate.name}
              </p>
            )}
          </div>

          {/* Review Links */}
          <ReviewLinksSection
            requiredFields={requiredLinkFields}
            reviewLinks={reviewLinks}
            extraLinks={extraLinks}
            onReviewLinkChange={handleReviewLinkChange}
            onAddExtraLink={handleAddExtraLink}
            onExtraLinkChange={handleExtraLinkChange}
            onRemoveExtraLink={handleRemoveExtraLink}
          />

          {/* Scope */}
          <ScopeSection
            revisionRounds={revisionRounds}
            feedbackWindows={feedbackWindows}
            rushedProject={rushedProject}
            repeatClient={repeatClient}
            onRevisionRoundsChange={setRevisionRounds}
            onFeedbackWindowsChange={setFeedbackWindows}
            onRushedProjectChange={setRushedProject}
            onRepeatClientChange={setRepeatClient}
          />

          {/* Version Notes */}
          <VersionNotesSection
            value={versionNotes}
            onChange={setVersionNotes}
            mentionItems={mentionItems}
          />

          {/* Recipients (email fields only shown when email mode is active) */}
          {showEmail && (
            <RecipientsSection
              primaryEmail={displayToEmail}
              ccEmails={displayCcEmails}
              senderEmail={displaySenderEmail}
              postToSlack={showSlack}
              senderOptions={senderOptions}
              onPrimaryEmailChange={setEditedToEmail}
              onCcEmailsChange={setEditedCcEmails}
              onSenderEmailChange={setEditedSenderEmail}
            />
          )}

          {/* Sender + Slack Channel (only shown when slack mode is active) */}
          {showSlack && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Sender</Label>
                  <SenderSelect
                    senders={senderOptions}
                    value={displaySenderEmail}
                    onValueChange={setEditedSenderEmail}
                  />
                </div>
                <SlackChannelSection
                  channelId={slackChannelId}
                  onChannelChange={setSlackChannelId}
                  senderEmail={displaySenderEmail}
                  onChannelNameResolved={setSlackChannelName}
                />
              </div>
            </>
          )}
        </div>

        {/* Right: Preview */}
        <div className="col-span-2">
          <PreviewPanel
            emailContent={displayEmailContent}
            slackContent={displaySlackContent}
            subjectLine={displaySubjectLine}
            primaryEmail={displayToEmail}
            senderEmail={displaySenderEmail}
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            onEmailContentChange={setEditedEmailContent}
            onSlackContentChange={setEditedSlackContent}
            onSubjectLineChange={setEditedSubjectLine}
            onResetToTemplate={handleResetToTemplate}
            contacts={contacts}
            mentionItems={mentionItems}
            showEmail={showEmail}
            showSlack={showSlack}
            templateTaskId={activeTemplate?.taskId}
            deliverableType={deliverableType}
            onSlackLintResult={showSlack ? setSlackLintErrors : undefined}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <SendBar
        taskId={task.id}
        formState={formState}
        mergedContent={mergedContent}
        primaryEmail={displayToEmail}
        ccEmails={displayCcEmails}
        senderEmail={displaySenderEmail}
        postToSlack={showSlack}
        slackChannelId={slackChannelId}
        originalDeliverableType={task.deliverableType}
        listId={task.listId}
        testMode={testMode}
        testEmail={testEmail}
        taskMeta={{
          clientName: task.clientName,
          projectName: task.projectName,
          department: task.department,
          slackChannelName: slackChannelName || undefined,
        }}
        slackLintErrors={showSlack ? slackLintErrors : undefined}
        adhocMode={adhocMode}
        adhocListId={adhocListId}
        adhocDeliverableType={adhocDeliverableType}
        adhocDepartment={adhocDepartment}
      />
    </div>
  );
}

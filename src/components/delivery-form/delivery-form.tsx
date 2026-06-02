"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Mail, MessageSquare, FlaskConical, Plus, CalendarClock, RotateCcw, Send } from "lucide-react";
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
import { useAutoSave } from "@/hooks/use-auto-save";
import { Button } from "@/components/ui/button";
import { SchedulePicker } from "./schedule-picker";
import type { ScheduledSendPayload } from "@/lib/schedule-send";
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
  buildCombinedTemplate,
  mergeCombinedTemplate,
  getRequiredLinkFields,
  getLinkLabelsFromTemplate,
} from "@/lib/template-merge";
import { AddonProjectModal } from "./addon-project-modal";
import type { AddonSelection } from "./addon-project-modal";
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

/** A prior delivery + its review-link records, used to prefill the form when
 *  resending a previously-sent delivery (?resendFrom=<deliveryId>). */
export interface ResendFrom {
  delivery: {
    id: string;
    primaryEmail: string;
    ccEmails: string | null;
    senderEmail: string;
    slackChannel: string | null;
    emailSubject: string;
    editedSnippet: string | null;
    editedSubject: string | null;
  };
  links: Array<{
    url: string;
    label: string;
    linkType: string;
    variableName: string | null;
  }>;
}

interface DeliveryFormProps {
  taskDetail: TaskDetail;
  adhocMode?: boolean;
  adhocListId?: string;
  adhocDeliverableType?: string;
  adhocDepartment?: string;
  /** Set when the user clicked Resend on a prior sent delivery. The form
   *  prefills its overridable fields with the prior values; on send, the
   *  send route writes a replacesDeliveryId link and skips re-completing
   *  the (already-complete) share task. */
  resendFrom?: ResendFrom;
}

export function DeliveryForm({
  taskDetail,
  adhocMode,
  adhocListId,
  adhocDeliverableType,
  adhocDepartment,
  resendFrom,
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
  const [linkLabels, setLinkLabels] = useState<Record<string, string>>({});
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
  // Per-delivery edited TEMPLATE body (with [tokens]) and subject. When set,
  // these override the active template for this delivery only — the merge runs
  // over them so links/scope keep flowing in after editing. They are never
  // written back to the shared template.
  const [editedSnippet, setEditedSnippet] = useState<string | null>(null);
  const [editedSubject, setEditedSubject] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [slackLintErrors, setSlackLintErrors] = useState<SlackLintError[]>([]);
  const [slackChannelName, setSlackChannelName] = useState<string>("");

  // ── Add-on project state ──
  const [addonProject, setAddonProject] = useState<AddonSelection | null>(null);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [addonReviewLinks, setAddonReviewLinks] = useState<Record<string, string>>({});
  const [addonLinkLabels, setAddonLinkLabels] = useState<Record<string, string>>({});
  const [addonRevisionRounds, setAddonRevisionRounds] = useState("");
  const [addonFeedbackWindows, setAddonFeedbackWindows] = useState("");
  // When a saved draft restores add-on fields, this guards the auto-prefill
  // effect below from overwriting the restored values with ClickUp defaults
  // the first time addonTaskDetail loads.
  const addonDraftRestored = useRef(false);

  // ── Editable recipient fields ──
  const [editedToEmail, setEditedToEmail] = useState<string | null>(null);
  const [editedCcEmails, setEditedCcEmails] = useState<string | null>(null);
  const [editedSenderEmail, setEditedSenderEmail] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const queryClient = useQueryClient();

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

  // ── Reset-to-ClickUp confirmation state ──
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetBlocked, setResetBlocked] = useState(false);

  const handleResetToClickUp = useCallback(() => {
    // Block reset if the delivery is currently scheduled — user must
    // cancel the schedule first so they don't accidentally lose work
    // that's queued to fire.
    if (scheduleStatus === "scheduled") {
      setResetBlocked(true);
      return;
    }
    setShowResetConfirm(true);
  }, [scheduleStatus]);

  const performReset = useCallback(async () => {
    // 1. Clear every form-state override back to the canonical taskDetail
    //    values. Same shape as the initial useState calls.
    setDeliverableType(task.deliverableType);
    setReviewLinks({
      googleDeliverableLink: taskDetail.reviewLinks.googleDeliverableLink ?? "",
      frameReviewLink: taskDetail.reviewLinks.frameReviewLink ?? "",
      loomReviewLink: taskDetail.reviewLinks.loomReviewLink ?? "",
      animaticReviewLink: taskDetail.reviewLinks.animaticReviewLink ?? "",
      flexLink: taskDetail.reviewLinks.flexLink ?? "",
    });
    setLinkLabels({});
    setExtraLinks([]);
    setRevisionRounds(taskDetail.revisionRounds);
    setFeedbackWindows(taskDetail.feedbackWindows);
    setVersionNotes(taskDetail.versionNotes);
    setRushedProject(false);
    setRepeatClient(false);
    setSlackChannelId(taskDetail.slackChannelId ?? "");
    setEditedSnippet(null);
    setEditedSubject(null);
    setIsEditMode(false);
    setEditedToEmail(null);
    setEditedCcEmails(null);
    setEditedSenderEmail(null);
    setAddonProject(null);
    setAddonReviewLinks({});
    setAddonLinkLabels({});
    setAddonRevisionRounds("");
    setAddonFeedbackWindows("");
    setTestMode(false);
    setDeliveryMode(detectedMode);

    // 2. Delete the auto-saved draft so the next 30s tick doesn't
    //    re-create the old state we just cleared.
    try {
      await fetch(`/api/drafts/${task.id}`, { method: "DELETE" });
    } catch {
      /* non-fatal — auto-save will overwrite shortly with the clean state */
    }

    setShowResetConfirm(false);
    toast.success("Reset to ClickUp defaults");
  }, [task.id, task.deliverableType, taskDetail.reviewLinks, taskDetail.revisionRounds, taskDetail.feedbackWindows, taskDetail.versionNotes, taskDetail.slackChannelId, detectedMode]);

  const handleTestModeToggle = useCallback(() => {
    setTestMode((prev) => {
      if (!prev) {
        // Entering test mode — override the recipient fields.
        setSlackChannelId(testSlackChannelId);
        setEditedToEmail(testEmail);
        setEditedCcEmails("");
      } else {
        // Leaving test mode — always reset back to canonical ClickUp
        // values. Previously we restored whatever the user had typed
        // before entering test mode, which is wrong if they entered test
        // mode while in a half-edited state (they expect "reset", not
        // "restore-last-input"). null on the edited fields lets the
        // form fall back to the primary contact's email from taskDetail.
        setSlackChannelId(taskDetail.slackChannelId ?? "");
        setEditedToEmail(null);
        setEditedCcEmails(null);
      }
      return !prev;
    });
  }, [taskDetail.slackChannelId, testEmail, testSlackChannelId]);

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

  // ── Fetch eligible add-on projects ──

  const { data: eligibleAddonsData } = useQuery<{
    projects: Array<{ listId: string; projectName: string }>;
  }>({
    queryKey: ["eligible-addons", task.listId, task.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(task.listId)}/eligible-addons?currentTaskId=${encodeURIComponent(task.id)}`
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: !!task.listId && task.listId !== "__adhoc__",
  });

  const hasEligibleAddons = (eligibleAddonsData?.projects?.length ?? 0) > 0;

  // ── Fetch add-on project detail ──

  const { data: addonTaskDetail } = useQuery<TaskDetail>({
    queryKey: ["addon-detail", addonProject?.listId, addonProject?.deliverableType, addonProject?.taskId],
    queryFn: async () => {
      const taskIdParam = addonProject!.taskId
        ? `&taskId=${encodeURIComponent(addonProject!.taskId)}`
        : "";
      const res = await fetch(
        `/api/projects/${encodeURIComponent(addonProject!.listId)}/detail?deliverableType=${encodeURIComponent(addonProject!.deliverableType)}${taskIdParam}`
      );
      if (!res.ok) throw new Error("Failed to fetch add-on project detail");
      return res.json();
    },
    enabled: !!addonProject?.listId && !!addonProject?.deliverableType,
    staleTime: 5 * 60_000,
  });

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

  const defaultLinkLabels = useMemo(() => {
    if (!activeTemplate?.snippet) return {};
    return getLinkLabelsFromTemplate(activeTemplate.snippet);
  }, [activeTemplate?.snippet]);

  // Pre-fill link labels from template defaults when they change
  useEffect(() => {
    if (Object.keys(defaultLinkLabels).length > 0) {
      setLinkLabels((prev) => {
        // Only fill in labels that aren't already set by the user
        const merged = { ...prev };
        for (const [varName, label] of Object.entries(defaultLinkLabels)) {
          if (!merged[varName]) {
            merged[varName] = label;
          }
        }
        return merged;
      });
    }
  }, [defaultLinkLabels]);

  // Pre-fill addon fields when detail loads
  useEffect(() => {
    if (addonTaskDetail) {
      // A resumed draft already populated these fields — don't clobber them
      // with ClickUp defaults on the first detail load.
      if (addonDraftRestored.current) {
        addonDraftRestored.current = false;
        return;
      }
      setAddonRevisionRounds(addonTaskDetail.revisionRounds || "");
      setAddonFeedbackWindows(addonTaskDetail.feedbackWindows || "");
      setAddonReviewLinks({
        googleDeliverableLink: addonTaskDetail.reviewLinks.googleDeliverableLink ?? "",
        frameReviewLink: addonTaskDetail.reviewLinks.frameReviewLink ?? "",
        loomReviewLink: addonTaskDetail.reviewLinks.loomReviewLink ?? "",
        animaticReviewLink: addonTaskDetail.reviewLinks.animaticReviewLink ?? "",
        flexLink: addonTaskDetail.reviewLinks.flexLink ?? "",
      });
      // Pre-fill addon link labels from template
      if (addonTaskDetail.template?.snippet) {
        const defaults = getLinkLabelsFromTemplate(addonTaskDetail.template.snippet);
        setAddonLinkLabels(defaults);
      }
    }
  }, [addonTaskDetail]);

  // ── Build merged preview ──

  const sameProject = !!addonProject && task.listId === addonProject.listId;

  // The default template body for this delivery: the active template for a
  // single delivery, or the assembled combined template (with namespaced
  // add-on tokens) for a merged delivery. The user edits this; the merge runs
  // over the edited version so links/scope keep flowing in.
  const defaultTemplate = useMemo(() => {
    if (!activeTemplate?.snippet) return "";
    if (addonProject && addonTaskDetail?.template?.snippet) {
      return buildCombinedTemplate({
        primaryTemplate: activeTemplate.snippet,
        addonTemplate: addonTaskDetail.template.snippet,
        addonProjectName: addonProject.projectName,
        addonDeliverableType: addonProject.deliverableType,
        sameProject,
      });
    }
    return activeTemplate.snippet;
  }, [activeTemplate?.snippet, addonProject, addonTaskDetail?.template?.snippet, sameProject]);

  const displayTemplate = editedSnippet ?? defaultTemplate;
  const displaySubject = editedSubject ?? activeTemplate?.subjectLine ?? "";

  const mergedContent: MergedContent | null = useMemo(() => {
    if (!activeTemplate?.snippet) return null;

    const primaryVariables = {
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
      linkLabels: Object.keys(linkLabels).length > 0 ? linkLabels : undefined,
    };

    // Merged delivery: merge the combined template, resolving primary tokens
    // and namespaced add-on tokens from their respective field sets.
    if (addonProject && addonTaskDetail?.template?.snippet) {
      return mergeCombinedTemplate({
        combinedTemplate: displayTemplate,
        subjectLine: displaySubject,
        primaryProjectName: task.projectName,
        addonProjectName: addonProject.projectName,
        primaryVariables,
        addonVariables: {
          projectName: addonProject.projectName,
          revisionRounds: addonRevisionRounds,
          feedbackWindows: addonFeedbackWindows,
          nextFeedbackDeadline: addonTaskDetail.feedbackDeadline?.formattedDate ?? "",
          googleDeliverableLink: addonReviewLinks.googleDeliverableLink,
          frameReviewLink: addonReviewLinks.frameReviewLink,
          animaticReviewLink: addonReviewLinks.animaticReviewLink,
          loomReviewLink: addonReviewLinks.loomReviewLink,
          flexLink: addonReviewLinks.flexLink,
          projectPlanLink: addonTaskDetail.projectPlanLink ?? undefined,
          linkLabels: Object.keys(addonLinkLabels).length > 0 ? addonLinkLabels : undefined,
        },
      });
    }

    // Single delivery: merge the (possibly edited) template directly.
    return mergeTemplate(displayTemplate, displaySubject, primaryVariables);
  }, [
    displayTemplate,
    displaySubject,
    activeTemplate?.snippet,
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
    linkLabels,
    addonProject,
    addonTaskDetail,
    addonReviewLinks,
    addonLinkLabels,
    addonRevisionRounds,
    addonFeedbackWindows,
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

    // Build Slack lookup so we can enrich project contacts that match a
    // Slack user (avatar, real name, and a richer handle). Without this,
    // a contact entered in ClickUp as just "Adam" would render with the
    // ClickUp name as primary and only @handle as secondary, even though
    // we already have "Adam Gunn" available from Slack.
    const slackMembers = slackMembersData?.members ?? [];
    const slackById = new Map<string, (typeof slackMembers)[number]>();
    for (const m of slackMembers) slackById.set(m.id, m);

    // Tier 1: Project contacts (from task detail)
    for (const contact of contacts) {
      const id = contact.slackUserId ?? contact.email;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const slackMatch = contact.slackUserId
        ? slackById.get(contact.slackUserId)
        : undefined;
      items.push({
        id,
        label: contact.name,
        // Enrich the muted secondary line with Slack's real_name when the
        // contact is also a Slack user and Slack's name differs from the
        // ClickUp name.
        realName:
          slackMatch?.realName && slackMatch.realName !== contact.name
            ? slackMatch.realName
            : undefined,
        slackUserId: contact.slackUserId,
        slackHandle: contact.slackHandle ?? slackMatch?.name,
        email: contact.email,
        avatar: slackMatch?.avatar,
        source: "project",
      });
    }

    // Tier 2: All Slack workspace members
    for (const member of slackMembers) {
      if (seenIds.has(member.id)) continue;
      seenIds.add(member.id);
      items.push({
        id: member.id,
        label: member.displayName || member.realName || member.name,
        realName: member.realName,
        slackUserId: member.id,
        slackHandle: member.name,
        avatar: member.avatar,
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
      // Reset edit mode + any per-delivery edits when the template changes
      setEditedSnippet(null);
      setEditedSubject(null);
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

  const handleAddonConfirm = useCallback((selection: AddonSelection) => {
    setAddonProject(selection);
    setAddonReviewLinks({});
    setAddonLinkLabels({});
    setAddonRevisionRounds("");
    setAddonFeedbackWindows("");
    // Adding an add-on changes the combined template shape — drop stale edits.
    setEditedSnippet(null);
    setEditedSubject(null);
  }, []);

  const handleRemoveAddon = useCallback(() => {
    setAddonProject(null);
    setAddonReviewLinks({});
    setAddonLinkLabels({});
    setAddonRevisionRounds("");
    setAddonFeedbackWindows("");
    // Removing the add-on collapses back to the single template — drop edits.
    setEditedSnippet(null);
    setEditedSubject(null);
  }, []);

  const handleToggleEditMode = useCallback(() => {
    // We intentionally do NOT pre-initialize editedSnippet here. The editor
    // receives displayTemplate, which falls through to defaultTemplate while
    // editedSnippet is null — so the preview stays reactive to form input
    // until the user actually types in the editor.
    setIsEditMode((prev) => !prev);
  }, []);

  const handleResetToTemplate = useCallback(() => {
    setEditedSnippet(null);
    setEditedSubject(null);
    setIsEditMode(false);
  }, []);

  // Final merged content to display/send. The merge always runs over the
  // (possibly edited) template, so this stays reactive even after editing.
  const displayEmailContent = mergedContent?.emailContent ?? "";
  const displaySubjectLine = mergedContent?.subjectLine ?? "";
  const displaySlackContent = mergedContent?.slackContent ?? "";

  // Build the form state for save/send
  const formState: DeliveryFormState = {
    deliverableType,
    reviewLinks,
    extraLinks: extraLinks.filter((l) => l.url && l.label),
    revisionRounds,
    feedbackWindows,
    versionNotes,
    slackChannelId,
    // Legacy frozen-snapshot fields are no longer produced by the editor; the
    // server reads `?? mergedContent`, and mergedContent already reflects any
    // template edits. Kept null for backward compatibility.
    editedEmailContent: null,
    editedSlackContent: null,
    editedSubjectLine: null,
    // The per-delivery template edits (drive mergedContent, persisted in drafts).
    editedSnippet,
    editedSubject,
    editedToEmail,
    editedCcEmails,
    editedSenderEmail,
    ...(addonProject ? {
      addonListId: addonProject.listId,
      addonTaskId: addonProject.taskId,
      addonDeliverableType: addonProject.deliverableType,
      addonDepartment: addonTaskDetail?.task.department,
      addonReviewLinks,
      addonLinkLabels,
      addonRevisionRounds,
      addonFeedbackWindows,
      addonProjectName: addonProject.projectName,
    } : {}),
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
        if (!draft || cancelled) return;

        if (draft.scheduledFor) setScheduledFor(draft.scheduledFor);
        if (draft.scheduleStatus) setScheduleStatus(draft.scheduleStatus);

        // Prefer the snapshot's formState if scheduled, since that's exactly
        // what will fire; falls back to draft.formData otherwise.
        const snapshot = draft.scheduledPayload as ScheduledSendPayload | null;
        const saved: DeliveryFormState | null =
          snapshot?.formState ?? (draft.formData as DeliveryFormState | null);
        if (!saved) return;
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
        if (saved.editedSnippet) setEditedSnippet(saved.editedSnippet);
        if (saved.editedSubject) setEditedSubject(saved.editedSubject);
        if (saved.editedToEmail) setEditedToEmail(saved.editedToEmail);
        if (saved.editedCcEmails) setEditedCcEmails(saved.editedCcEmails);
        if (saved.editedSenderEmail) setEditedSenderEmail(saved.editedSenderEmail);

        // Restore the add-on (merged delivery) so resuming a draft keeps it a
        // merged delivery instead of collapsing back to a single one. Setting
        // addonProject re-triggers the addon-detail fetch; the guard ref keeps
        // the prefill effect from overwriting the values we restore here.
        if (saved.addonListId && saved.addonProjectName && saved.addonDeliverableType) {
          addonDraftRestored.current = true;
          setAddonProject({
            listId: saved.addonListId,
            projectName: saved.addonProjectName,
            deliverableType: saved.addonDeliverableType,
            taskId: saved.addonTaskId,
          });
          if (saved.addonReviewLinks) setAddonReviewLinks(saved.addonReviewLinks);
          if (saved.addonLinkLabels) setAddonLinkLabels(saved.addonLinkLabels);
          if (saved.addonRevisionRounds) setAddonRevisionRounds(saved.addonRevisionRounds);
          if (saved.addonFeedbackWindows) setAddonFeedbackWindows(saved.addonFeedbackWindows);
        }
      } catch {
        // Silent — draft restoration is best-effort
      } finally {
        if (!cancelled) setDraftLoaded(true);
      }
    }

    loadDraft();
    return () => { cancelled = true; };
  }, [task.id, draftLoaded]);

  // ── Resend prefill ──
  //
  // Applied once when `resendFrom` becomes available. Overrides the form
  // state with what was actually sent on the prior delivery: recipient,
  // sender, CCs, slack channel, subject, review/extra links, and the
  // template/subject edits the user had made.
  const resendApplied = useRef(false);
  useEffect(() => {
    if (!resendFrom || resendApplied.current) return;
    resendApplied.current = true;
    const { delivery: prior, links } = resendFrom;
    if (prior.primaryEmail) setEditedToEmail(prior.primaryEmail);
    if (prior.ccEmails) setEditedCcEmails(prior.ccEmails);
    if (prior.senderEmail) setEditedSenderEmail(prior.senderEmail);
    if (prior.slackChannel) setSlackChannelId(prior.slackChannel);
    if (prior.editedSnippet) setEditedSnippet(prior.editedSnippet);
    if (prior.editedSubject) setEditedSubject(prior.editedSubject);

    const standardByVar: Record<string, string> = {};
    const extras: Array<{ url: string; label: string }> = [];
    for (const link of links) {
      if (link.linkType === "extra") {
        extras.push({ url: link.url, label: link.label });
      } else if (link.variableName) {
        standardByVar[link.variableName] = link.url;
      }
    }
    if (Object.keys(standardByVar).length > 0) {
      setReviewLinks((prev) => ({ ...prev, ...standardByVar }));
    }
    if (extras.length > 0) setExtraLinks(extras);
  }, [resendFrom]);

  const isScheduled = scheduleStatus === "scheduled" && Boolean(scheduledFor);

  const buildScheduledPayload = useCallback((): ScheduledSendPayload => ({
    formState,
    mergedContent,
    primaryEmail: displayToEmail,
    ccEmails: displayCcEmails,
    senderEmail: displaySenderEmail,
    postToSlack: showSlack,
    slackChannelId,
    originalDeliverableType: task.deliverableType,
    listId: task.listId,
    taskMeta: {
      clientName: task.clientName,
      projectName: task.projectName,
      department: task.department,
      slackChannelName: slackChannelName || undefined,
    },
    ...(addonProject
      ? {
          addonListId: addonProject.listId,
          addonTaskId: addonProject.taskId,
          addonDeliverableType: addonProject.deliverableType,
          addonDepartment: addonTaskDetail?.task.department,
          addonReviewLinks,
          addonProjectName: addonProject.projectName,
        }
      : {}),
  }), [
    formState,
    mergedContent,
    displayToEmail,
    displayCcEmails,
    displaySenderEmail,
    showSlack,
    slackChannelId,
    task.deliverableType,
    task.listId,
    task.clientName,
    task.projectName,
    task.department,
    slackChannelName,
    addonProject,
    addonTaskDetail?.task.department,
    addonReviewLinks,
  ]);

  const handleReschedule = async (iso: string) => {
    setIsUpdatingSchedule(true);
    try {
      const res = await fetch(`/api/drafts/${task.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: iso,
          payload: buildScheduledPayload(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to reschedule");
      }
      setScheduledFor(iso);
      setScheduleStatus("scheduled");
      toast.success("Rescheduled");
      queryClient.invalidateQueries({ queryKey: ["scheduled", "list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reschedule");
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const handleCancelSchedule = async () => {
    setIsUpdatingSchedule(true);
    try {
      const res = await fetch(`/api/drafts/${task.id}/schedule`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to cancel schedule");
      }
      setScheduledFor(null);
      setScheduleStatus(null);
      toast.success("Schedule cancelled — back in Drafts");
      queryClient.invalidateQueries({ queryKey: ["scheduled", "list"] });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel schedule");
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const handleUpdateSchedule = async () => {
    if (!scheduledFor) return;
    setIsUpdatingSchedule(true);
    try {
      const res = await fetch(`/api/drafts/${task.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor,
          payload: buildScheduledPayload(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to update schedule");
      }
      toast.success("Schedule updated");
      queryClient.invalidateQueries({ queryKey: ["scheduled", "list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update schedule");
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Resend banner */}
      {resendFrom && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-amber-500/10 border-y border-amber-500/30 text-sm flex items-center gap-3 backdrop-blur">
          <Send className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
          <div className="text-amber-900 dark:text-amber-200">
            <strong>Resending a prior delivery.</strong>{" "}
            Recipient, sender, channel, subject, and review links are prefilled from what was sent before — review and correct anything that was wrong, then click Send. The share task won&apos;t be re-completed.
          </div>
        </div>
      )}

      {/* Scheduled banner */}
      {isScheduled && scheduledFor && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-blue-500/10 border-y border-blue-500/30 text-sm flex items-center justify-between gap-3 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="truncate">
              <strong>Scheduled for</strong>{" "}
              {new Date(scheduledFor).toLocaleString("en-US", {
                timeZone: "America/New_York",
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
              <span className="ml-2 text-muted-foreground">
                {"— edits below take effect only when you click “Update schedule”."}
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <SchedulePicker
              busy={isUpdatingSchedule}
              onSchedule={handleReschedule}
              trigger={
                <Button variant="outline" size="sm" disabled={isUpdatingSchedule}>
                  Reschedule
                </Button>
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelSchedule}
              disabled={isUpdatingSchedule}
            >
              Cancel schedule
            </Button>
          </div>
        </div>
      )}

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

        {/* Reset to ClickUp defaults */}
        <button
          type="button"
          onClick={handleResetToClickUp}
          title="Discard all edits and reload from ClickUp"
          className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-border"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to ClickUp
        </button>

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
            {" "}No ClickUp changes. Task won&apos;t be marked complete.
          </span>
        </div>
      )}

      {/* Add-on project banner / button */}
      {addonProject ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#6AC387]/40 bg-[#6AC387]/10 px-4 py-2.5">
          <Plus className="h-4 w-4 text-[#6AC387] shrink-0" />
          <span className="text-sm flex-1">
            Combined with <strong>{addonProject.projectName}</strong>
            <span className="text-muted-foreground"> — {addonProject.deliverableType}</span>
          </span>
          <button
            type="button"
            onClick={handleRemoveAddon}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        </div>
      ) : hasEligibleAddons ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#6AC387] border border-[#6AC387]/40 bg-[#6AC387]/5 rounded-full px-2.5 py-1">
            Contact match found
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddonModal(true)}
            className="border-[#6AC387]/40 text-[#6AC387] hover:bg-[#6AC387]/10 hover:text-[#5aad74]"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Merge Delivery
          </Button>
        </div>
      ) : null}

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
            linkLabels={linkLabels}
            defaultLinkLabels={defaultLinkLabels}
            extraLinks={extraLinks}
            onReviewLinkChange={handleReviewLinkChange}
            onLinkLabelChange={(field, value) =>
              setLinkLabels((prev) => ({ ...prev, [field]: value }))
            }
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

          {/* Add-on project fields */}
          {addonProject && addonTaskDetail && (
            <div className="space-y-6 rounded-lg border border-[#6AC387]/30 bg-[#6AC387]/5 p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  📎 {addonProject.projectName} — {addonProject.deliverableType}
                </span>
              </div>

              <ReviewLinksSection
                requiredFields={addonTaskDetail.template ? getRequiredLinkFields(addonTaskDetail.template.snippet) : []}
                reviewLinks={addonReviewLinks}
                linkLabels={addonLinkLabels}
                defaultLinkLabels={addonTaskDetail.template ? getLinkLabelsFromTemplate(addonTaskDetail.template.snippet) : {}}
                extraLinks={[]}
                onReviewLinkChange={(field, value) =>
                  setAddonReviewLinks((prev) => ({ ...prev, [field]: value }))
                }
                onLinkLabelChange={(field, value) =>
                  setAddonLinkLabels((prev) => ({ ...prev, [field]: value }))
                }
                onAddExtraLink={() => {}}
                onExtraLinkChange={() => {}}
                onRemoveExtraLink={() => {}}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Revision Rounds</Label>
                  <SearchableSelect
                    options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]}
                    value={addonRevisionRounds}
                    onValueChange={setAddonRevisionRounds}
                    placeholder="Select..."
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Feedback Windows</Label>
                  <SearchableSelect
                    options={[
                      { value: "Same day", label: "Same day" },
                      { value: "24 Hours", label: "24 Hours" },
                      { value: "48 Hours", label: "48 Hours" },
                    ]}
                    value={addonFeedbackWindows}
                    onValueChange={setAddonFeedbackWindows}
                    placeholder="Select..."
                  />
                </div>
              </div>
            </div>
          )}

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
            templateContent={displayTemplate}
            templateSubject={displaySubject}
            primaryEmail={displayToEmail}
            senderEmail={displaySenderEmail}
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            onTemplateChange={setEditedSnippet}
            onSubjectChange={setEditedSubject}
            onResetToTemplate={handleResetToTemplate}
            contacts={contacts}
            mentionItems={mentionItems}
            showEmail={showEmail}
            showSlack={showSlack}
            templateTaskId={activeTemplate?.taskId}
            deliverableType={deliverableType}
            addonTemplateTaskId={
              addonProject && addonTaskDetail?.template?.taskId
                ? addonTaskDetail.template.taskId
                : undefined
            }
            addonTemplateLabel={
              addonProject && addonTaskDetail?.template?.deliverableType
                ? addonTaskDetail.template.deliverableType
                : undefined
            }
            onSlackLintResult={showSlack ? setSlackLintErrors : undefined}
          />
        </div>
      </div>

      {/* Add-on project modal */}
      <AddonProjectModal
        open={showAddonModal}
        onOpenChange={setShowAddonModal}
        currentListId={task.listId}
        deliverableTypeOptions={deliverableTypeOptions}
        onConfirm={handleAddonConfirm}
      />

      {/* Reset-to-ClickUp confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to ClickUp defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              Any unsaved edits to subject, body, links, recipients, scope,
              sender, and channel will be discarded. The form will reload
              with the canonical values from ClickUp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performReset}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset-blocked notice (delivery is scheduled) */}
      <AlertDialog open={resetBlocked} onOpenChange={setResetBlocked}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the scheduled send first</AlertDialogTitle>
            <AlertDialogDescription>
              This delivery is currently scheduled to auto-send. Cancel the
              schedule from the form&apos;s scheduled banner before resetting
              so you don&apos;t accidentally discard a queued send.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResetBlocked(false)}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        addonListId={addonProject?.listId}
        addonTaskId={addonProject?.taskId}
        addonDeliverableType={addonProject?.deliverableType}
        addonDepartment={addonTaskDetail?.task.department}
        addonReviewLinks={addonProject ? addonReviewLinks : undefined}
        resendOf={resendFrom?.delivery.id}
        addonProjectName={addonProject?.projectName}
        scheduledMode={isScheduled}
        onUpdateSchedule={isScheduled ? handleUpdateSchedule : undefined}
        isUpdatingSchedule={isUpdatingSchedule}
      />
    </div>
  );
}

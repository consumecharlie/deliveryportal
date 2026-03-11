import { NextResponse } from "next/server";
import {
  getListTasks,
  updateTaskCustomField,
  updateTaskStatus,
  extractCustomFieldValue,
} from "@/lib/clickup";
import {
  CUSTOM_FIELDS,
  PROJECT_TASK_TYPES,
  DEPARTMENT_CC_EMAILS,
} from "@/lib/custom-field-ids";
import { prisma } from "@/lib/db";
import { mergeTemplate, convertToSlackFormat } from "@/lib/template-merge";
import type { DeliveryFormState, MergedContent, SendPayload } from "@/lib/types";
import { getSessionUserEmail } from "@/lib/get-session-user";

interface SendRequestBody {
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
}

/**
 * POST /api/tasks/[taskId]/send
 *
 * 1. Writes form fields back to ClickUp
 * 2. Syncs feedback deadline deliverable type if changed
 * 3. Calls n8n webhook with the send payload
 * 4. Marks the task complete in ClickUp on success
 * 5. Logs the delivery to the portal database
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const body: SendRequestBody = await req.json();
    const {
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
    } = body;

    const userEmail = await getSessionUserEmail();

    // ── Test mode: override recipients based on delivery channel ──
    // Slack mode test: send to test channel only, no email
    // Email mode test: send to test email only, no Slack
    const testSlackChannel = process.env.TEST_SLACK_CHANNEL_ID || "";
    const resolvedTestEmail = testEmail || process.env.TEST_EMAIL || userEmail;

    const effectiveEmail = testMode
      ? (postToSlack ? "" : resolvedTestEmail)  // Slack mode → no email; Email mode → test email
      : primaryEmail;
    const effectiveCcEmails = testMode ? "" : ccEmails;
    const effectiveSlackChannel = testMode
      ? (postToSlack ? testSlackChannel : "")   // Slack mode → test channel; Email mode → no Slack
      : slackChannelId;
    const effectivePostToSlack = testMode
      ? postToSlack && !!testSlackChannel        // Only post to Slack if in Slack delivery mode
      : postToSlack;

    // ── 1. Write form fields to ClickUp (skip in test mode) ──

    if (!testMode) {
      const fieldUpdates: Array<{ fieldId: string; value: unknown }> = [];

      // Review links
      if (formState.reviewLinks.googleDeliverableLink) {
        fieldUpdates.push({
          fieldId: CUSTOM_FIELDS.GOOGLE_LINK,
          value: formState.reviewLinks.googleDeliverableLink,
        });
      }
      if (formState.reviewLinks.frameReviewLink) {
        fieldUpdates.push({
          fieldId: CUSTOM_FIELDS.FRAME_IO_LINK,
          value: formState.reviewLinks.frameReviewLink,
        });
      }
      if (formState.reviewLinks.loomReviewLink) {
        fieldUpdates.push({
          fieldId: CUSTOM_FIELDS.LOOM_LINK,
          value: formState.reviewLinks.loomReviewLink,
        });
      }
      if (formState.versionNotes) {
        fieldUpdates.push({
          fieldId: CUSTOM_FIELDS.VERSION_NOTES,
          value: formState.versionNotes,
        });
      }
      if (slackChannelId) {
        fieldUpdates.push({
          fieldId: CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID,
          value: slackChannelId,
        });
      }

      // Write fields to ClickUp in parallel
      await Promise.allSettled(
        fieldUpdates.map((update) =>
          updateTaskCustomField(taskId, update.fieldId, update.value)
        )
      );

      // ── 2. Sync feedback deadline if deliverable type changed ──

      if (formState.deliverableType !== originalDeliverableType) {
        try {
          const siblings = await getListTasks(listId, true);
          for (const sibling of siblings.tasks) {
            const sibTaskType = extractCustomFieldValue(
              sibling.custom_fields,
              CUSTOM_FIELDS.PROJECT_TASK_TYPE
            );
            const rawType = sibling.custom_fields.find(
              (f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
            )?.value;

            const isFeedbackDeadline =
              sibTaskType === "Feedback Deadline" ||
              String(rawType) === PROJECT_TASK_TYPES.FEEDBACK_DEADLINE;

            if (!isFeedbackDeadline) continue;

            const sibDeliverableType = extractCustomFieldValue(
              sibling.custom_fields,
              CUSTOM_FIELDS.DELIVERABLE_TYPE
            );

            // Match the original type and has a future due date
            if (
              sibDeliverableType === originalDeliverableType &&
              sibling.due_date &&
              Number(sibling.due_date) > Date.now()
            ) {
              // Update the feedback deadline's deliverable type to match
              await updateTaskCustomField(
                sibling.id,
                CUSTOM_FIELDS.DELIVERABLE_TYPE,
                formState.deliverableType
              );
              break; // Only update the first (nearest) match
            }
          }
        } catch (err) {
          console.error("Failed to sync feedback deadline:", err);
          // Non-fatal: continue with send
        }
      }
    }

    // ── 3. Build the n8n webhook payload ──

    const emailContent =
      formState.editedEmailContent ?? mergedContent?.emailContent ?? "";
    // Slack content is stored as markdown (same format as email but with
    // <@userId> mention tokens). Convert to Slack mrkdwn for the API.
    const slackMarkdown =
      formState.editedSlackContent ?? mergedContent?.slackContent ?? "";
    const slackContent = convertToSlackFormat(slackMarkdown);
    const emailSubject =
      formState.editedSubjectLine ?? mergedContent?.subjectLine ?? "";

    // Calculate dynamic task counts from sibling Delivery Deadline tasks
    let tasksWaitingCount = 0;
    let tasksInProgressCount = 0;
    let tasksUpcomingCount = 0;

    try {
      const siblingTasks = await getListTasks(listId, true);
      for (const sib of siblingTasks.tasks) {
        const sibTaskType = extractCustomFieldValue(
          sib.custom_fields,
          CUSTOM_FIELDS.PROJECT_TASK_TYPE
        );
        const rawType = sib.custom_fields.find(
          (f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
        )?.value;

        const isDeliveryDeadline =
          sibTaskType === "Delivery Deadline" ||
          String(rawType) === PROJECT_TASK_TYPES.DELIVERY_DEADLINE;

        if (!isDeliveryDeadline || sib.id === taskId) continue;

        const status = sib.status.status.toLowerCase();
        if (status === "complete" || status === "closed") continue;

        if (status === "in progress" || status === "in review") {
          tasksInProgressCount++;
        } else if (sib.due_date && Number(sib.due_date) > Date.now()) {
          tasksUpcomingCount++;
        } else {
          tasksWaitingCount++;
        }
      }
    } catch (countErr) {
      console.warn("Failed to calculate task counts:", countErr);
    }

    // ── Build communication log from prior deliveries for this project ──

    let communicationLog = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const priorDeliveries: any[] = await prisma.delivery.findMany({
        where: { projectListId: listId || undefined },
        orderBy: { sentAt: "desc" },
        take: 20,
        select: {
          sentAt: true,
          deliverableType: true,
          department: true,
          emailSubject: true,
          senderEmail: true,
          primaryEmail: true,
          wasEdited: true,
        },
      });

      if (priorDeliveries.length > 0) {
        communicationLog = priorDeliveries
          .map((d) => {
            const date = d.sentAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            return `${date} — ${d.deliverableType} (${d.department}) — "${d.emailSubject}" — Sent by ${d.senderEmail} to ${d.primaryEmail}`;
          })
          .join("\n");
      }
    } catch {
      // Non-fatal: DB might not be connected
      console.warn("Failed to build communication log (DB may not be connected)");
    }

    const sendPayload: SendPayload & { is_test?: boolean } = {
      email_content: emailContent,
      slack_content: slackContent,
      slack_channel: effectiveSlackChannel,
      primary_email: effectiveEmail,
      cc_emails: effectiveCcEmails,
      email_subject: testMode ? `[TEST] ${emailSubject}` : emailSubject,
      sender_email: senderEmail,
      post_to_slack: effectivePostToSlack,
      communication_log: communicationLog,
      tasks_waiting_count: tasksWaitingCount,
      tasks_in_progress_count: tasksInProgressCount,
      tasks_upcoming_count: tasksUpcomingCount,
      task_id: taskId,
      ...(testMode ? { is_test: true } : {}),
    };

    // ── 4. Call n8n webhook ──

    const n8nWebhookUrl = process.env.N8N_PORTAL_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      // If webhook not configured yet, just log and continue
      console.warn(
        "N8N_PORTAL_WEBHOOK_URL not set. Skipping n8n trigger. Payload:",
        JSON.stringify(sendPayload, null, 2)
      );
    } else {
      const n8nRes = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendPayload),
      });

      if (!n8nRes.ok) {
        const errText = await n8nRes.text().catch(() => "");
        throw new Error(`n8n webhook failed: ${n8nRes.status} ${errText}`);
      }
    }

    // ── 5. Mark task complete in ClickUp (skip in test mode) ──

    if (!testMode) {
      await updateTaskStatus(taskId, "complete");
    }

    // ── 6. Log delivery to portal DB (skip in test mode) ──

    let deliveryId: string | undefined;
    if (!testMode) {
      try {
        const delivery = await prisma.delivery.create({
          data: {
            taskId,
            projectName: "", // populated below if available
            clientName: "",
            deliverableType: formState.deliverableType,
            department: "",
            senderEmail,
            primaryEmail,
            ccEmails: ccEmails || null,
            slackChannel: slackChannelId || null,
            emailSubject: emailSubject,
            emailContent: emailContent,
            slackContent: slackContent || null,
            wasEdited: !!(formState.editedEmailContent || formState.editedSlackContent),
            sentBy: userEmail,
            projectListId: listId || null,
            clientFolderId: null,
          },
        });
        deliveryId = delivery.id;

        // Save links
        const linkRecords = Object.entries(formState.reviewLinks)
          .filter(([, url]) => !!url)
          .map(([varName, url]) => ({
            deliveryId: delivery.id,
            url,
            label: varName,
            linkType: "standard",
            variableName: varName,
            projectListId: listId || "",
            clientFolderId: "",
          }));

        // Add extra links
        for (const extra of formState.extraLinks ?? []) {
          if (extra.url) {
            linkRecords.push({
              deliveryId: delivery.id,
              url: extra.url,
              label: extra.label || extra.url,
              linkType: "extra",
              variableName: null as unknown as string,
              projectListId: listId || "",
              clientFolderId: "",
            });
          }
        }

        if (linkRecords.length > 0) {
          await prisma.deliveryLink.createMany({ data: linkRecords });
        }

        // Delete any saved draft for this task
        await prisma.draft.deleteMany({ where: { taskId } });
      } catch (dbErr) {
        console.warn("Delivery DB logging failed (DB may not be connected):", dbErr);
        // Non-fatal: the delivery was still sent successfully
      }
    }

    return NextResponse.json({ success: true, deliveryId, testMode: !!testMode });
  } catch (error) {
    console.error("Send failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import {
  createTask,
  getListFields,
  updateTaskCustomField,
  updateTaskStatus,
} from "@/lib/clickup";
import {
  CUSTOM_FIELDS,
  PROJECT_TASK_TYPES,
  LINK_VARIABLE_MAP,
} from "@/lib/custom-field-ids";
import { prisma } from "@/lib/db";
import { convertToSlackFormat } from "@/lib/template-merge";
import type {
  DeliveryFormState,
  MergedContent,
  SendPayload,
} from "@/lib/types";
import { getSessionUserEmail } from "@/lib/get-session-user";

interface AdhocSendRequestBody {
  listId: string;
  deliverableType: string;
  department: string;
  formState: DeliveryFormState;
  mergedContent: MergedContent | null;
  primaryEmail: string;
  ccEmails: string;
  senderEmail: string;
  postToSlack: boolean;
  slackChannelId: string;
  testMode?: boolean;
  testEmail?: string;
  taskMeta?: {
    clientName?: string;
    projectName?: string;
    department?: string;
    slackChannelName?: string;
  };
}

/**
 * POST /api/deliverable/adhoc-send
 *
 * Creates a new ClickUp task for an ad hoc delivery, then runs the
 * standard send flow (n8n webhook, mark complete, log to DB).
 */
export async function POST(req: Request) {
  try {
    const body: AdhocSendRequestBody = await req.json();
    const {
      listId,
      deliverableType,
      department,
      formState,
      mergedContent,
      primaryEmail,
      ccEmails,
      senderEmail,
      postToSlack,
      slackChannelId,
      testMode,
      testEmail,
      taskMeta,
    } = body;

    if (!listId) {
      return NextResponse.json(
        { error: "listId is required" },
        { status: 400 }
      );
    }

    const userEmail = await getSessionUserEmail();

    // ── 1. Create the ClickUp task ──

    // Build text-only custom fields for task creation
    const textFields: Array<{ id: string; value: unknown }> = [];

    const emailContent =
      formState.editedEmailContent ?? mergedContent?.emailContent ?? "";
    const emailSubject =
      formState.editedSubjectLine ?? mergedContent?.subjectLine ?? "";

    if (formState.versionNotes) {
      textFields.push({ id: CUSTOM_FIELDS.VERSION_NOTES, value: formState.versionNotes });
    }
    if (formState.revisionRounds) {
      textFields.push({ id: CUSTOM_FIELDS.REVISION_ROUNDS, value: formState.revisionRounds });
    }
    if (formState.feedbackWindows) {
      textFields.push({ id: CUSTOM_FIELDS.FEEDBACK_WINDOWS, value: formState.feedbackWindows });
    }
    if (slackChannelId) {
      textFields.push({ id: CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID, value: slackChannelId });
    }

    const newTask = await createTask(listId, {
      name: `Share ${deliverableType} with Client`,
      custom_fields: textFields,
    });

    const taskId = newTask.id;

    // Resolve dropdown option IDs from the list's field definitions
    const fieldsRes = await getListFields(listId);
    const fields = fieldsRes.fields ?? [];

    const resolveOptionId = (fieldId: string, optionName: string): string | null => {
      const field = fields.find((f: { id: string }) => f.id === fieldId);
      if (!field?.type_config?.options) return null;
      const option = field.type_config.options.find(
        (o: { name?: string; label?: string }) =>
          o.name === optionName || o.label === optionName
      );
      return option ? String(option.orderindex) : null;
    };

    // Set dropdown fields via individual updates
    const dropdownUpdates: Promise<void>[] = [];

    if (deliverableType) {
      const optionId = resolveOptionId(CUSTOM_FIELDS.DELIVERABLE_TYPE, deliverableType);
      if (optionId) {
        dropdownUpdates.push(
          updateTaskCustomField(taskId, CUSTOM_FIELDS.DELIVERABLE_TYPE, optionId)
        );
      }
    }

    if (department) {
      const optionId = resolveOptionId(CUSTOM_FIELDS.DEPARTMENT, department);
      if (optionId) {
        dropdownUpdates.push(
          updateTaskCustomField(taskId, CUSTOM_FIELDS.DEPARTMENT, optionId)
        );
      }
    }

    // PROJECT_TASK_TYPE → "Delivery Deadline"
    {
      const optionId = resolveOptionId(
        CUSTOM_FIELDS.PROJECT_TASK_TYPE,
        "Delivery Deadline"
      );
      if (optionId) {
        dropdownUpdates.push(
          updateTaskCustomField(taskId, CUSTOM_FIELDS.PROJECT_TASK_TYPE, optionId)
        );
      }
    }

    // Set review link URL fields
    for (const [varName, url] of Object.entries(formState.reviewLinks)) {
      if (!url) continue;
      const mapping = LINK_VARIABLE_MAP[varName];
      if (mapping) {
        dropdownUpdates.push(
          updateTaskCustomField(taskId, mapping.fieldId, url)
        );
      }
    }

    await Promise.allSettled(dropdownUpdates);

    // ── 2. Run the send flow ──

    // Test mode: override recipients
    const testSlackChannel = process.env.TEST_SLACK_CHANNEL_ID || "";
    const resolvedTestEmail = testEmail || process.env.TEST_EMAIL || userEmail;

    const effectiveEmail = testMode
      ? (postToSlack ? "" : resolvedTestEmail)
      : primaryEmail;
    const effectiveCcEmails = testMode ? "" : ccEmails;
    const effectiveSlackChannel = testMode
      ? (postToSlack ? testSlackChannel : "")
      : slackChannelId;
    const effectivePostToSlack = testMode
      ? postToSlack && !!testSlackChannel
      : postToSlack;

    // Slack content conversion
    const slackMarkdown =
      formState.editedSlackContent ?? mergedContent?.slackContent ?? "";
    const slackContent = convertToSlackFormat(slackMarkdown);

    // Build communication log from prior deliveries
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
      tasks_waiting_count: 0,
      tasks_in_progress_count: 0,
      tasks_upcoming_count: 0,
      task_id: taskId,
      skip_email_draft: postToSlack,
      ...(testMode ? { is_test: true } : {}),
    };

    // Call n8n webhook
    const n8nWebhookUrl = process.env.N8N_PORTAL_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
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

    // ── 3. Mark complete + log (skip in test mode) ──

    if (!testMode) {
      await updateTaskStatus(taskId, "complete");
    }

    let deliveryId: string | undefined;
    if (!testMode) {
      try {
        const delivery = await prisma.delivery.create({
          data: {
            taskId,
            projectName: taskMeta?.projectName || "",
            clientName: taskMeta?.clientName || "",
            deliverableType,
            department: taskMeta?.department || department,
            senderEmail,
            primaryEmail,
            ccEmails: ccEmails || null,
            slackChannel: slackChannelId || null,
            slackChannelName: taskMeta?.slackChannelName || null,
            emailSubject,
            emailContent,
            slackContent: slackContent || null,
            wasEdited: !!(
              formState.editedEmailContent || formState.editedSlackContent
            ),
            sentBy: userEmail,
            projectListId: listId || null,
            clientFolderId: null,
          },
        });
        deliveryId = delivery.id;

        // Save review links
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
      } catch (dbErr) {
        console.warn("Delivery DB logging failed (DB may not be connected):", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      deliveryId,
      testMode: !!testMode,
    });
  } catch (error) {
    console.error("Adhoc send failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Adhoc send failed" },
      { status: 500 }
    );
  }
}

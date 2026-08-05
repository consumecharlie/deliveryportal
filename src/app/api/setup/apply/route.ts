import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  setSlackChannel,
  createProjectContact,
  updateContactFields,
} from "@/lib/project-write";
import { joinChannel } from "@/lib/slack-audit";
import { scanProject } from "@/lib/audit-scan";

export const maxDuration = 60;

interface ApplyContact {
  action: "create" | "update";
  taskId?: string;
  name: string;
  email?: string;
  userId?: string;
  role: "Primary" | "Standard" | "Log";
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * POST /api/setup/apply
 * { listId, channelId?, join?, contacts: ApplyContact[] }
 *
 * Applies a configure-from-channel plan: set the Slack channel, join the bot,
 * and create/update contacts in ClickUp — each item isolated so one failure
 * doesn't abort the rest — then re-scans the project.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      listId?: string;
      channelId?: string;
      join?: boolean;
      contacts?: ApplyContact[];
    };
    if (!body.listId) {
      return NextResponse.json({ error: "listId is required" }, { status: 400 });
    }

    const results: Array<{ item: string; ok: boolean; error?: string }> = [];

    if (body.channelId) {
      try {
        await setSlackChannel(body.listId, body.channelId);
        results.push({ item: "channel", ok: true });
      } catch (e) {
        results.push({ item: "channel", ok: false, error: msg(e) });
      }
      if (body.join) {
        try {
          const r = await joinChannel(body.channelId);
          results.push({ item: "join", ok: r.ok, error: r.error });
        } catch (e) {
          results.push({ item: "join", ok: false, error: msg(e) });
        }
      }
    }

    for (const c of body.contacts ?? []) {
      try {
        if (c.action === "create") {
          await createProjectContact(body.listId, {
            name: c.name,
            email: c.email,
            userId: c.userId,
            role: c.role,
          });
        } else if (c.taskId) {
          await updateContactFields(c.taskId, { email: c.email, userId: c.userId });
        }
        results.push({ item: c.name, ok: true });
      } catch (e) {
        results.push({ item: c.name, ok: false, error: msg(e) });
      }
    }

    // Re-scan the project so its health row reflects the changes.
    try {
      const row = await prisma.auditResult.findUnique({
        where: { listId: body.listId },
      });
      if (row) {
        await scanProject({
          listId: body.listId,
          clientName: row.clientName,
          projectName: row.projectName,
        });
      }
    } catch (e) {
      console.error("post-apply rescan failed:", e);
    }

    return NextResponse.json({ results });
  } catch (e) {
    console.error("apply failed:", e);
    return NextResponse.json({ error: "Apply failed" }, { status: 500 });
  }
}

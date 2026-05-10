import { NextResponse } from "next/server";
import { getListFields } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS, WORKSPACE_ID } from "@/lib/custom-field-ids";
import { prisma } from "@/lib/db";
import { clickupUserToMember, filterMembersByAllowlist, type WorkspaceMember } from "@/lib/allowed-senders";

interface DropdownOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string;
}

/**
 * GET /api/templates/field-options
 *
 * Returns the available options for Department, Deliverable Type, and Sender
 * custom fields, pulled directly from ClickUp's field definitions.
 */
export async function GET() {
  try {
    // Fetch field definitions from the delivery snippets list
    const { fields } = await getListFields(LISTS.DELIVERY_SNIPPETS);

    // Extract Department options (dropdown)
    const departmentField = fields.find(
      (f) => f.id === TEMPLATE_FIELDS.DEPARTMENT
    );
    const departmentOptions: DropdownOption[] =
      departmentField?.type_config?.options?.map((o) => ({
        id: o.id,
        name: o.name ?? o.label ?? "",
        orderindex: o.orderindex,
        color: o.color,
      })) ?? [];

    // Extract Deliverable Type options (dropdown)
    const deliverableTypeField = fields.find(
      (f) => f.id === TEMPLATE_FIELDS.DELIVERABLE_TYPE
    );
    const deliverableTypeOptions: DropdownOption[] =
      deliverableTypeField?.type_config?.options?.map((o) => ({
        id: o.id,
        name: o.name ?? o.label ?? "",
        orderindex: o.orderindex,
        color: o.color,
      })) ?? [];

    // Fetch workspace members for the Sender field
    // ClickUp v2: GET /team lists all teams; each team has members
    let senderOptions: WorkspaceMember[] = [];
    try {
      const teamsRes = await fetch(
        `https://api.clickup.com/api/v2/team`,
        {
          headers: {
            Authorization: process.env.CLICKUP_API_TOKEN ?? "",
            "Content-Type": "application/json",
          },
        }
      );

      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        // Find our workspace team
        const teams = teamsData.teams ?? [];
        const team = teams.find(
          (t: { id: string }) => t.id === WORKSPACE_ID
        ) ?? teams[0];

        if (team?.members) {
          const mapped: WorkspaceMember[] = team.members.map(clickupUserToMember);

          let allowedIds = new Set<number>();
          try {
            const rows = await prisma.allowedSender.findMany({ select: { clickupUserId: true } });
            allowedIds = new Set(rows.map((r) => r.clickupUserId));
          } catch (dbErr) {
            console.warn("Failed to load AllowedSender rows; sender list will be empty:", dbErr);
          }

          senderOptions = filterMembersByAllowlist(mapped, allowedIds);
        }
      }
    } catch (memberErr) {
      console.warn("Failed to fetch workspace members:", memberErr);
    }

    return NextResponse.json({
      department: departmentOptions,
      deliverableType: deliverableTypeOptions,
      sender: senderOptions,
    });
  } catch (error) {
    console.error("Failed to fetch field options:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch field options",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getListFields } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS, WORKSPACE_ID } from "@/lib/custom-field-ids";

interface DropdownOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string;
}

interface MemberOption {
  id: number;
  username: string;
  email: string;
  profilePicture?: string;
  initials: string;
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
    let senderOptions: MemberOption[] = [];
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
          senderOptions = team.members.map(
            (m: {
              user: {
                id: number;
                username: string;
                email: string;
                profilePicture?: string;
              };
            }) => {
              const user = m.user;
              const name = (user.username ?? user.email ?? "").trim();
              const initials = name
                .split(/[\s.@]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => (p[0] ?? "").toUpperCase())
                .join("");
              return {
                id: user.id ?? 0,
                username: user.username ?? "",
                email: user.email ?? "",
                profilePicture: user.profilePicture ?? undefined,
                initials,
              };
            }
          );

          // Only show portal users who have n8n credentials configured
          const ALLOWED_SENDERS = new Set([
            "louis galanti",
            "landon schellman",
            "tony saffell",
            "sadjr williams",
            "michael rosenberg",
          ]);

          senderOptions = senderOptions.filter((m) =>
            ALLOWED_SENDERS.has(m.username.toLowerCase())
          );

          // Sort alphabetically by username
          senderOptions.sort((a, b) => a.username.localeCompare(b.username));
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

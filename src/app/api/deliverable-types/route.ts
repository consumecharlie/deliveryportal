import { NextResponse } from "next/server";
import { getListFields } from "@/lib/clickup";
import { CUSTOM_FIELDS } from "@/lib/custom-field-ids";

/**
 * GET /api/deliverable-types
 *
 * Returns all deliverable type options from the ClickUp custom field definition.
 * Uses any list in the Projects space to read the field schema — the field
 * definition (including its dropdown options) is the same across all lists
 * that use the same custom field.
 *
 * Falls back to fetching field options from a known task if the list-level
 * endpoint doesn't return options.
 */

interface DeliverableTypeOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string;
}

// Cache the options in memory (they rarely change)
let cachedOptions: DeliverableTypeOption[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function GET() {
  try {
    // Return cached if fresh
    if (cachedOptions && Date.now() - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json({ options: cachedOptions });
    }

    // Try fetching field definitions from the Delivery Snippets list first,
    // since it also uses the Deliverable Type field and is a single list (fast).
    const { fields } = await getListFields("901312119609");

    const deliverableTypeField = fields.find(
      (f) => f.id === CUSTOM_FIELDS.DELIVERABLE_TYPE
    );

    if (deliverableTypeField?.type_config?.options) {
      const options: DeliverableTypeOption[] =
        deliverableTypeField.type_config.options
          .sort((a, b) => a.orderindex - b.orderindex)
          .map((opt) => ({
            id: opt.id,
            name: opt.name ?? opt.label ?? "",
            orderindex: opt.orderindex,
            color: opt.color,
          }));

      cachedOptions = options;
      cacheTimestamp = Date.now();

      return NextResponse.json({ options });
    }

    // Fallback: return empty array if field not found
    return NextResponse.json({ options: [] });
  } catch (error) {
    console.error("Failed to fetch deliverable types:", error);
    return NextResponse.json(
      { error: "Failed to fetch deliverable types" },
      { status: 500 }
    );
  }
}

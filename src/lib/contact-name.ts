import { extractCustomFieldValue } from "@/lib/clickup";
import { CUSTOM_FIELDS } from "@/lib/custom-field-ids";
import type { ClickUpCustomField } from "@/lib/types";

/**
 * Every contact task in ClickUp is NAMED "Project Contact", so the task name
 * is never a usable fallback for a person's name. A contact with a blank
 * Contact First Name field once greeted a client as "Hey JC and Project
 * Contact" (Fisher Wealth Partners, 2026-10-08).
 */
const PLACEHOLDER_NAMES = new Set(["project contact", "contact", "client"]);

/** A usable greeting name, or "" when the value is blank or a placeholder. */
export function cleanContactName(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) return "";
  return name;
}

/** The contact's first name from its Contact First Name field, or "". Never the task name. */
export function contactFirstName(fields: ClickUpCustomField[]): string {
  return cleanContactName(
    extractCustomFieldValue(fields, CUSTOM_FIELDS.CONTACT_FIRST_NAME)
  );
}

import { describe, it, expect } from "vitest";
import { cleanContactName, contactFirstName } from "@/lib/contact-name";
import { mergeTemplate } from "@/lib/template-merge";
import { CUSTOM_FIELDS } from "@/lib/custom-field-ids";
import type { ClickUpCustomField, ProjectContact } from "@/lib/types";

const firstNameField = (value: string | null) =>
  [{ id: CUSTOM_FIELDS.CONTACT_FIRST_NAME, type: "short_text", value }] as unknown as ClickUpCustomField[];

const contact = (name: string, role = "Standard", email = ""): ProjectContact => ({
  taskId: name || "t",
  name,
  email,
  role,
});

const greet = (contacts: ProjectContact[]) =>
  mergeTemplate("Hey [contacts], here it is.", "For [contacts]", {
    contacts,
    projectName: "Brand Story",
    versionNotes: "",
    revisionRounds: "",
    feedbackWindows: "",
    nextFeedbackDeadline: "",
  }).emailContent;

describe("contactFirstName", () => {
  it("reads the Contact First Name field", () => {
    expect(contactFirstName(firstNameField("JC"))).toBe("JC");
  });
  it("is empty when the field is blank, never the task name", () => {
    expect(contactFirstName(firstNameField(null))).toBe("");
    expect(contactFirstName(firstNameField("   "))).toBe("");
    expect(contactFirstName([])).toBe("");
  });
  it("rejects placeholder values typed into the field", () => {
    expect(cleanContactName("Project Contact")).toBe("");
    expect(cleanContactName(" project contact ")).toBe("");
  });
});

describe("greeting", () => {
  it("leaves out a contact with no first name (Fisher Wealth Partners, 2026-10-08)", () => {
    const out = greet([contact("JC", "Primary"), contact("")]);
    expect(out).toBe("Hey JC, here it is.");
  });
  it("leaves out a stale 'Project Contact' name, e.g. from an old draft", () => {
    const out = greet([contact("JC", "Primary"), contact("Project Contact")]);
    expect(out).not.toMatch(/Project Contact/);
    expect(out).toBe("Hey JC, here it is.");
  });
  it("still joins real names", () => {
    expect(greet([contact("JC", "Primary"), contact("Harrison")])).toBe("Hey JC and Harrison, here it is.");
  });
});

/**
 * ClickUp Custom Field IDs
 *
 * All IDs discovered from the live Consume Media workspace.
 * These are stable UUIDs that don't change.
 */

// Custom fields on deliverable tasks in the Projects space
export const CUSTOM_FIELDS = {
  DEPARTMENT: "9c2697d0-d5c4-4618-a422-6df8eca162da",
  PROJECT_TASK_TYPE: "200b412c-e3d5-45b0-bf7d-211c984613a2",
  DELIVERABLE_TYPE: "bd34f878-d41d-416e-92c4-7d6d5b378442",
  GOOGLE_LINK: "c7fe67e2-9325-4e4e-826d-039752e271da",
  FRAME_IO_LINK: "5096c22f-1106-43b7-a286-09031891a4f1",
  ANIMATIC_LINK: "5afea174-c618-4123-ad9a-1fa91f9ade35", // Shares ID with Loom; verify in practice
  LOOM_LINK: "5afea174-c618-4123-ad9a-1fa91f9ade35",
  VERSION_NOTES: "84fc88d9-474c-49fd-be15-da1512fb708f",
  REVISION_ROUNDS: "9de40477-3f29-487a-80ae-034455790433",
  FEEDBACK_WINDOWS: "a3b310ad-21f1-4f53-bc23-9057037cd82d",
  CONTACT_FIRST_NAME: "625204f3-be54-4a5b-874f-7ca406572c3c",
  CONTACT_EMAIL: "f7d02e8c-d8dd-4849-8f74-9299d166e935",
  CONTACT_ROLE: "df213cbb-9728-42b6-bf2a-bf5c219cadc5",
  PROJECT_PLAN_LINK: "e71116b1-b902-442a-b73c-7a9f6c76bb79",
  SLACK_DELIVERY_CHANNEL_ID: "4203f948-c57f-4b9c-a307-6c0d869b7178",
  SLACK_USER_ID: "07204bb9-64cd-4a71-940f-563a654bf92f",
  SLACK_HANDLE: "16a1612b-4a76-4082-b47e-bec3a48410e1",
  VIDEO_NAME: "6290c98a-d5d4-4894-8918-d127777f7dfe",
  FLEX_LINK: "60ad01af-cfd0-4d87-b6e9-4c57194651ab",
} as const;

// Custom fields on delivery snippet templates in the Templates space
export const TEMPLATE_FIELDS = {
  DELIVERY_SNIPPET: "507e9cfa-9c91-4a0f-8c85-c3cd88b2f9bc",
  DELIVERY_SUBJECT_LINE: "12062ce3-5e74-413c-85bf-dc60dd8e4daf",
  DELIVERABLE_TYPE: "bd34f878-d41d-416e-92c4-7d6d5b378442",
  SENDER: "585ea464-6ae4-4938-ba9e-3223e4ba79fa",
  DEPARTMENT: "9c2697d0-d5c4-4618-a422-6df8eca162da",
  TIMELINE: "7b894f84-e26e-4bb8-9415-17d1130b9857",
} as const;

// Project Task Type option IDs (from the dropdown)
export const PROJECT_TASK_TYPES = {
  PROJECT_CONTACT: "0e2eb10c-24ee-455f-9f69-402547f24848",
  PROJECT_PLAN: "9511329f-a9fb-470c-9cde-7ac84fcdef11",
  SLACK_CHANNEL: "17ca0f13-03ce-49b4-a38f-a3ffa61e9351",
  FEEDBACK_DEADLINE: "df55c582-abd8-4e6f-85cd-012414d7fde6",
  DELIVERY_DEADLINE: "9946beb1-b5e1-4ee9-829d-278edf707812",
} as const;

// Space and list IDs
export const SPACES = {
  PROJECTS: "90030181746",
  TEMPLATES: "90100159712",
} as const;

export const LISTS = {
  DELIVERY_SNIPPETS: "901312119609",
} as const;

// Department CC email mapping
export const DEPARTMENT_CC_EMAILS: Record<string, string> = {
  "Pre-Pro": "pre-production@consume-media.com",
  "Pre-Production": "pre-production@consume-media.com",
  Design: "design@consume-media.com",
  Post: "post-production@consume-media.com",
  "Post-Production": "post-production@consume-media.com",
  Production: "production@consume-media.com",
};

// Template variable to custom field mapping for link fields
export const LINK_VARIABLE_MAP: Record<
  string,
  { fieldId: string; label: string }
> = {
  frameReviewLink: {
    fieldId: CUSTOM_FIELDS.FRAME_IO_LINK,
    label: "Frame.io Review Link",
  },
  animaticReviewLink: {
    fieldId: CUSTOM_FIELDS.ANIMATIC_LINK,
    label: "Animatic Link",
  },
  loomReviewLink: { fieldId: CUSTOM_FIELDS.LOOM_LINK, label: "Loom Walkthrough Link" },
  googleDeliverableLink: {
    fieldId: CUSTOM_FIELDS.GOOGLE_LINK,
    label: "Google Deliverable Link",
  },
  flexLink: { fieldId: CUSTOM_FIELDS.FLEX_LINK, label: "Flexible Link" },
};

// ClickUp workspace
export const WORKSPACE_ID = "9010023164";

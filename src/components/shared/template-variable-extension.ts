/**
 * Known template variables with their display labels and categories.
 *
 * These must match the keys used in the merge engine (src/lib/template-merge.ts)
 * and the variables available in the delivery form.
 */
export const TEMPLATE_VARIABLE_META: Record<
  string,
  { label: string; category: "contact" | "project" | "link" | "sender" }
> = {
  // ── Contact ──
  contacts: { label: "Contact Names", category: "contact" },
  contactFirstName: { label: "Contact First Name", category: "contact" },
  contactName: { label: "Contact Name", category: "contact" },

  // ── Project ──
  projectName: { label: "Project Name", category: "project" },
  clientName: { label: "Client Name", category: "project" },
  deliverableType: { label: "Deliverable Type", category: "project" },
  revisionRounds: { label: "Revision Rounds", category: "project" },
  feedbackWindows: { label: "Feedback Windows", category: "project" },
  nextFeedbackDeadline: { label: "Feedback Deadline", category: "project" },
  versionNotes: { label: "Version Notes", category: "project" },

  // ── Review Links ──
  frameReviewLink: { label: "Frame.io Link", category: "link" },
  googleDeliverableLink: { label: "Google Link", category: "link" },
  loomReviewLink: { label: "Loom Link", category: "link" },
  animaticReviewLink: { label: "Animatic Link", category: "link" },
  flexLink: { label: "Flex Link", category: "link" },
  projectPlanLink: { label: "Project Plan Link", category: "link" },

  // ── Sender ──
  senderFirstName: { label: "Sender First Name", category: "sender" },
  senderName: { label: "Sender Name", category: "sender" },
};

export const CATEGORY_COLORS: Record<string, string> = {
  contact: "template-var-contact",
  project: "template-var-project",
  link: "template-var-link",
  sender: "template-var-sender",
};

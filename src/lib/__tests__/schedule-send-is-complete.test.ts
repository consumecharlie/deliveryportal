import { describe, it, expect } from "vitest";
import {
  isFormComplete,
  missingFields,
  type ScheduledSendPayload,
} from "../schedule-send";

const completeEmailPayload: ScheduledSendPayload = {
  formState: {
    deliverableType: "Final cut",
    reviewLinks: { googleDeliverableLink: "https://drive.google.com/x" },
    extraLinks: [],
    revisionRounds: "2",
    feedbackWindows: "3 days",
    versionNotes: "",
    slackChannelId: "",
    editedEmailContent: null,
    editedSlackContent: null,
    editedSubjectLine: null,
    editedToEmail: null,
    editedCcEmails: null,
    editedSenderEmail: null,
  },
  mergedContent: {
    emailContent: "Hi there",
    slackContent: "Hi there",
    subjectLine: "Your delivery",
  },
  primaryEmail: "client@x.com",
  ccEmails: "",
  senderEmail: "sender@consume-media.com",
  postToSlack: false,
  slackChannelId: "",
  originalDeliverableType: "Final cut",
  listId: "list-123",
};

const completeSlackPayload: ScheduledSendPayload = {
  ...completeEmailPayload,
  primaryEmail: "",
  senderEmail: "",
  postToSlack: true,
  slackChannelId: "C123",
};

describe("isFormComplete (email mode)", () => {
  it("returns true for a complete email payload", () => {
    expect(isFormComplete(completeEmailPayload)).toBe(true);
  });

  it("returns false when primary email is missing", () => {
    expect(
      isFormComplete({ ...completeEmailPayload, primaryEmail: "" })
    ).toBe(false);
  });

  it("returns false when sender email is missing", () => {
    expect(
      isFormComplete({ ...completeEmailPayload, senderEmail: "" })
    ).toBe(false);
  });

  it("returns false when deliverable type is missing", () => {
    expect(
      isFormComplete({
        ...completeEmailPayload,
        formState: { ...completeEmailPayload.formState, deliverableType: "" },
      })
    ).toBe(false);
  });

  it("returns false when there's no subject (no edit, no merged)", () => {
    expect(
      isFormComplete({
        ...completeEmailPayload,
        mergedContent: {
          ...completeEmailPayload.mergedContent!,
          subjectLine: "",
        },
      })
    ).toBe(false);
  });

  it("returns false when there's no email body content", () => {
    expect(
      isFormComplete({
        ...completeEmailPayload,
        mergedContent: {
          ...completeEmailPayload.mergedContent!,
          emailContent: "",
        },
      })
    ).toBe(false);
  });

  it("accepts edited fields when merged content is null", () => {
    expect(
      isFormComplete({
        ...completeEmailPayload,
        mergedContent: null,
        formState: {
          ...completeEmailPayload.formState,
          editedSubjectLine: "Subject",
          editedEmailContent: "Body",
        },
      })
    ).toBe(true);
  });
});

describe("isFormComplete (Slack mode)", () => {
  it("returns true for a complete Slack payload", () => {
    expect(isFormComplete(completeSlackPayload)).toBe(true);
  });

  it("returns false when slackChannelId is missing", () => {
    expect(
      isFormComplete({ ...completeSlackPayload, slackChannelId: "" })
    ).toBe(false);
  });

  it("does not require primaryEmail/senderEmail in Slack mode", () => {
    expect(
      isFormComplete({
        ...completeSlackPayload,
        primaryEmail: "",
        senderEmail: "",
      })
    ).toBe(true);
  });
});

describe("missingFields", () => {
  it("lists every missing label for an email payload", () => {
    expect(
      missingFields({
        ...completeEmailPayload,
        primaryEmail: "",
        formState: { ...completeEmailPayload.formState, deliverableType: "" },
      })
    ).toEqual(["Deliverable type", "Recipient email"]);
  });

  it("returns empty array for a complete payload", () => {
    expect(missingFields(completeEmailPayload)).toEqual([]);
  });

  it("returns Slack channel label when missing in Slack mode", () => {
    expect(
      missingFields({ ...completeSlackPayload, slackChannelId: "" })
    ).toEqual(["Slack channel"]);
  });
});

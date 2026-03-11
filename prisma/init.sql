-- Deliverable Portal schema: 4 tables

CREATE TABLE IF NOT EXISTS "Delivery" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "taskId" TEXT NOT NULL,
  "projectName" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "deliverableType" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "senderEmail" TEXT NOT NULL,
  "primaryEmail" TEXT NOT NULL,
  "ccEmails" TEXT,
  "slackChannel" TEXT,
  "emailSubject" TEXT NOT NULL,
  "emailContent" TEXT NOT NULL,
  "slackContent" TEXT,
  "wasEdited" BOOLEAN NOT NULL DEFAULT false,
  "sentBy" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "n8nExecutionId" TEXT,
  "n8nStatus" TEXT,
  "projectListId" TEXT,
  "clientFolderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Delivery_taskId_idx" ON "Delivery"("taskId");
CREATE INDEX IF NOT EXISTS "Delivery_projectListId_idx" ON "Delivery"("projectListId");
CREATE INDEX IF NOT EXISTS "Delivery_clientFolderId_idx" ON "Delivery"("clientFolderId");
CREATE INDEX IF NOT EXISTS "Delivery_sentAt_idx" ON "Delivery"("sentAt");

CREATE TABLE IF NOT EXISTS "DeliveryLink" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "deliveryId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "linkType" TEXT NOT NULL,
  "variableName" TEXT,
  "projectListId" TEXT NOT NULL,
  "clientFolderId" TEXT NOT NULL,
  CONSTRAINT "DeliveryLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryLink_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DeliveryLink_deliveryId_idx" ON "DeliveryLink"("deliveryId");
CREATE INDEX IF NOT EXISTS "DeliveryLink_projectListId_idx" ON "DeliveryLink"("projectListId");

CREATE TABLE IF NOT EXISTS "Draft" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "taskId" TEXT NOT NULL,
  "formData" JSONB NOT NULL,
  "savedBy" TEXT NOT NULL,
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Draft_taskId_key" ON "Draft"("taskId");
CREATE INDEX IF NOT EXISTS "Draft_taskId_idx" ON "Draft"("taskId");

CREATE TABLE IF NOT EXISTS "TemplateVersion" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "templateTaskId" TEXT NOT NULL,
  "templateName" TEXT NOT NULL,
  "snippet" TEXT NOT NULL,
  "subjectLine" TEXT NOT NULL,
  "deliverableType" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "editedBy" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changeNote" TEXT,
  CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TemplateVersion_templateTaskId_idx" ON "TemplateVersion"("templateTaskId");
CREATE INDEX IF NOT EXISTS "TemplateVersion_editedAt_idx" ON "TemplateVersion"("editedAt");

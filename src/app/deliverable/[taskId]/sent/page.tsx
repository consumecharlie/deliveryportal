"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Mail,
  MessageSquare,
  ExternalLink,
  ArrowLeft,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SentConfirmationPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const searchParams = useSearchParams();

  const primaryEmail = searchParams.get("to") ?? "";
  const ccEmails = searchParams.get("cc") ?? "";
  const senderEmail = searchParams.get("from") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const slackPosted = searchParams.get("slack") === "true";
  const deliveryId = searchParams.get("deliveryId") ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      {/* Success header */}
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-bold">Delivery Sent!</h1>
        <p className="text-muted-foreground max-w-md">
          {slackPosted && !primaryEmail
            ? "The deliverable has been sent successfully. A Slack message was posted and the task has been marked complete in ClickUp."
            : "The deliverable has been sent successfully. An email draft was created and the task has been marked complete in ClickUp."}
        </p>
      </div>

      {/* Delivery details card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Delivery Summary</CardTitle>
          <CardDescription>Task ID: {taskId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email section — only show when email was part of the delivery */}
          {(primaryEmail || subject) && (
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Email Draft Created</p>
                {subject && (
                  <p className="text-sm text-muted-foreground">
                    Subject: {subject}
                  </p>
                )}
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">To:</span> {primaryEmail}
                </div>
                {ccEmails && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">CC:</span> {ccEmails}
                  </div>
                )}
                {senderEmail && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">From:</span> {senderEmail}
                  </div>
                )}
              </div>
            </div>
          )}

          {slackPosted && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Slack Message Posted</p>
                  <p className="text-sm text-muted-foreground">
                    A Slack notification was sent to the delivery channel.
                  </p>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">ClickUp Task Updated</p>
              <p className="text-sm text-muted-foreground">
                Task status set to &quot;complete&quot; and all fields synced.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3">
        <Link href="/">
          <Button variant="outline">
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <a
          href={`https://app.clickup.com/t/${taskId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" />
            View in ClickUp
          </Button>
        </a>
        {deliveryId && (
          <Link href="/sent">
            <Button>View Sent Deliveries</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

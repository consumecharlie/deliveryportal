"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatManualDeadline } from "@/lib/feedback-deadline";
import type { FeedbackConflictCopy } from "@/lib/feedback-conflict";

export interface FeedbackConflictWarningProps {
  copy: FeedbackConflictCopy;
  /** Eastern date the window implies, "YYYY-MM-DD". */
  expectedDate: string;
  /** Eastern date currently set, "YYYY-MM-DD". */
  actualDate: string;
  /** Window label that matches the dates as they stand, when ClickUp offers one. */
  suggestedWindowLabel: string | null;
  /** Name of the ClickUp deadline task that would move, if there is one. */
  deadlineTaskName?: string;
  /** False for ad-hoc deliveries, which have no deadline task to move. */
  writesToClickUp: boolean;
  onUseWindow: () => void | Promise<void>;
  onUseDeadline: () => void | Promise<void>;
  onDismiss: () => void;
  busy?: "window" | "deadline" | null;
}

const fmt = (date: string) => formatManualDeadline(date, "").formattedDate;

export function FeedbackConflictWarning({
  copy,
  expectedDate,
  actualDate,
  suggestedWindowLabel,
  deadlineTaskName,
  writesToClickUp,
  onUseWindow,
  onUseDeadline,
  onDismiss,
  busy,
}: FeedbackConflictWarningProps) {
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);

  // Moving the deadline shifts a real project date, so it always confirms first
  // and names the exact task. Setting the window does not.
  const requestMoveDeadline = () => {
    if (writesToClickUp) setShowMoveConfirm(true);
    else void onUseWindow();
  };

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium text-amber-900 dark:text-amber-100">{copy.headline}</p>
          <p className="text-amber-800 dark:text-amber-200">{copy.detail}</p>
          <p className="text-amber-800 dark:text-amber-200">{copy.consequence}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={requestMoveDeadline}
          disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/70"
        >
          {busy === "window" && <Loader2 className="h-3 w-3 animate-spin" />}
          Window is right, move deadline to {fmt(expectedDate)}
        </button>

        {suggestedWindowLabel ? (
          <button
            type="button"
            onClick={() => void onUseDeadline()}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/70"
          >
            {busy === "deadline" && <Loader2 className="h-3 w-3 animate-spin" />}
            Deadline is right, set window to {suggestedWindowLabel}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          disabled={!!busy}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-amber-800 underline-offset-2 transition-colors hover:underline disabled:opacity-60 dark:text-amber-200"
        >
          Send as-is
        </button>
      </div>

      {!suggestedWindowLabel && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          No Feedback Windows option in ClickUp matches the {fmt(actualDate)} deadline, so
          only the deadline can be corrected from here.
        </p>
      )}

      <AlertDialog open={showMoveConfirm} onOpenChange={setShowMoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move feedback deadline?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deadlineTaskName && (
                  <p className="font-medium text-foreground">{deadlineTaskName}</p>
                )}
                <p className="text-base">
                  {fmt(actualDate)} <span className="text-muted-foreground">to</span>{" "}
                  {fmt(expectedDate)}
                </p>
                <p>This changes the due date in ClickUp.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onUseWindow()}>Move deadline</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

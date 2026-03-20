"use client";

import { useEffect, useRef, useCallback } from "react";
import type { DeliveryFormState } from "@/lib/types";

const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

interface UseAutoSaveOptions {
  taskId: string;
  formState: DeliveryFormState;
  savedBy?: string;
  enabled?: boolean;
}

/**
 * Auto-saves the delivery form state to the portal database every 30 seconds.
 * This is a lightweight save — no ClickUp write, just local persistence
 * so the user can resume where they left off.
 */
export function useAutoSave({
  taskId,
  formState,
  savedBy = "portal-user",
  enabled = true,
}: UseAutoSaveOptions) {
  const formStateRef = useRef(formState);
  const lastSavedRef = useRef<string>("");
  const isMountedRef = useRef(true);

  // Keep ref in sync with latest form state
  useEffect(() => {
    formStateRef.current = formState;
  }, [formState]);

  const save = useCallback(async () => {
    if (!isMountedRef.current) return;

    const currentJson = JSON.stringify(formStateRef.current);
    // Skip if nothing changed since last save
    if (currentJson === lastSavedRef.current) return;

    try {
      const res = await fetch(`/api/drafts/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formData: formStateRef.current,
          savedBy,
        }),
      });

      if (res.ok) {
        lastSavedRef.current = currentJson;
      }
    } catch {
      // Silent failure — auto-save is best-effort
    }
  }, [taskId]);

  // Set up the interval
  useEffect(() => {
    if (!enabled) return;

    isMountedRef.current = true;

    const intervalId = setInterval(save, AUTO_SAVE_INTERVAL);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [save, enabled]);

  // Save on unmount (e.g. navigating away)
  useEffect(() => {
    return () => {
      // Fire-and-forget save on unmount
      const currentJson = JSON.stringify(formStateRef.current);
      if (currentJson !== lastSavedRef.current) {
        fetch(`/api/drafts/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formData: formStateRef.current,
            savedBy,
          }),
        }).catch(() => {});
      }
    };
  }, [taskId]);

  return { saveNow: save };
}

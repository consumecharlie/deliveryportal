"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { DeliveryForm, type ResendFrom } from "@/components/delivery-form/delivery-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaskDetail } from "@/lib/types";

export default function DeliverablePage() {
  const { taskId } = useParams<{ taskId: string }>();
  const searchParams = useSearchParams();
  const resendFromId = searchParams.get("resendFrom");

  const { data, isLoading, error } = useQuery<TaskDetail>({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) throw new Error("Failed to load task");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: false, // Don't auto-refetch while editing
  });

  // When ?resendFrom=<deliveryId> is set, fetch the prior delivery so the form
  // can prefill recipient/sender/links/scope/template edits from what was
  // actually sent before.
  const { data: resendData } = useQuery<{ delivery: ResendFrom["delivery"] & { links: ResendFrom["links"] } }>({
    queryKey: ["delivery", resendFromId],
    queryFn: async () => {
      const res = await fetch(`/api/deliveries/${resendFromId}`);
      // Note: this hits the existing GET /api/deliveries/[id] route, which
      // already returns the delivery + its links — no new endpoint needed.
      if (!res.ok) throw new Error("Failed to load delivery");
      return res.json();
    },
    enabled: !!resendFromId,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Failed to load task details. Please try again.
      </div>
    );
  }

  const resendFrom: ResendFrom | undefined = resendData?.delivery
    ? { delivery: resendData.delivery, links: resendData.delivery.links }
    : undefined;

  return <DeliveryForm taskDetail={data} resendFrom={resendFrom} />;
}

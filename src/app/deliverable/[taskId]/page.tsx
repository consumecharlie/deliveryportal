"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { DeliveryForm } from "@/components/delivery-form/delivery-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaskDetail } from "@/lib/types";

export default function DeliverablePage() {
  const { taskId } = useParams<{ taskId: string }>();

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

  return <DeliveryForm taskDetail={data} />;
}

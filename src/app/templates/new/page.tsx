"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import PacmanLoader from "@/components/ui/pacman-loader";

export default function NewTemplatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <PacmanLoader size={32} />
          <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>
            CREATING TEMPLATE
          </span>
        </div>
      }
    >
      <AutoCreateTemplate />
    </Suspense>
  );
}

/**
 * Auto-creates a blank template task in ClickUp and redirects to the full editor.
 * Accepts ?type= query param to pre-fill the deliverable type.
 */
function AutoCreateTemplate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const creatingRef = useRef(false);

  const deliverableType = searchParams.get("type") ?? "";
  const templateName = deliverableType || "New Template";

  useEffect(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;

    async function create() {
      try {
        const res = await fetch("/api/templates/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: templateName,
            snippet: "",
            subjectLine: "",
            deliverableType,
            department: "",
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create template");
        }

        const data = await res.json();
        toast.success("Template created", {
          description: "Opening the editor...",
        });
        router.replace(`/templates/${data.taskId}`);
      } catch (error) {
        toast.error("Failed to create template", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        router.replace("/templates");
      }
    }

    create();
  }, [deliverableType, templateName, router]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <PacmanLoader size={32} />
      <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>
        CREATING TEMPLATE
      </span>
    </div>
  );
}

"use client";

import { useState, useMemo, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { ArrowLeft, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEPARTMENTS = [
  { value: "Pre-Production", label: "Pre-Production" },
  { value: "Pre-Pro", label: "Pre-Pro" },
  { value: "Design", label: "Design" },
  { value: "Post-Production", label: "Post-Production" },
  { value: "Post", label: "Post" },
  { value: "Production", label: "Production" },
  { value: "Project Management", label: "Project Management" },
];

export default function NewTemplatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      }
    >
      <NewTemplateContent />
    </Suspense>
  );
}

function NewTemplateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const prefilledType = searchParams.get("type") ?? "";
  const [name, setName] = useState(prefilledType);
  const [deliverableType, setDeliverableType] = useState(prefilledType);
  const [department, setDepartment] = useState("");

  const { data: deliverableTypesData } = useQuery<{
    options: Array<{ id: string; name: string; orderindex: number }>;
  }>({
    queryKey: ["deliverable-types"],
    queryFn: async () => {
      const res = await fetch("/api/deliverable-types");
      if (!res.ok) throw new Error("Failed to fetch deliverable types");
      return res.json();
    },
    staleTime: 30 * 60_000,
  });

  const deliverableTypeOptions = useMemo(() => {
    const options = deliverableTypesData?.options ?? [];
    return options.map((o) => ({ value: o.name, label: o.name }));
  }, [deliverableTypesData]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/templates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          snippet: "",
          subjectLine: "",
          deliverableType,
          department,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create template");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template created", {
        description: "Opening the template editor...",
      });
      router.push(`/templates/${data.taskId}`);
    },
    onError: (error) => {
      toast.error("Failed to create template", {
        description: error.message,
      });
    },
  });

  const canSubmit = name.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header — matches the editor page style */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/templates")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {name || "New Template"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Set up the basics, then edit the full template.
            </p>
          </div>
        </div>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Create & Open Editor
        </Button>
      </div>

      {/* Simple form matching the editor's right sidebar layout */}
      <div className="max-w-xl">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Location Options"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Deliverable Type</Label>
              <SearchableSelect
                options={deliverableTypeOptions}
                value={deliverableType}
                onValueChange={setDeliverableType}
                placeholder="Select type"
                searchPlaceholder="Search types..."
              />
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <SearchableSelect
                options={DEPARTMENTS}
                value={department}
                onValueChange={setDepartment}
                placeholder="Select department"
                searchPlaceholder="Search..."
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

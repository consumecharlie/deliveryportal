"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { ArrowLeft, Save, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

// Same variable reference as the editor page
const TEMPLATE_VARIABLES = [
  { name: "contacts", description: "Formatted contact names (e.g. 'John and Jane')" },
  { name: "contactFirstName", description: "Primary contact's first name" },
  { name: "contactName", description: "Primary contact's full name" },
  { name: "projectName", description: "Project/list name from ClickUp" },
  { name: "clientName", description: "Client/folder name from ClickUp" },
  { name: "deliverableType", description: "The deliverable type" },
  { name: "revisionRounds", description: "Number of revision rounds" },
  { name: "feedbackWindows", description: "Feedback window duration" },
  { name: "nextFeedbackDeadline", description: "Next feedback deadline date" },
  { name: "feedbackDeadline", description: "Formatted feedback deadline date" },
  { name: "versionNotes", description: "Version notes from the form" },
  { name: "frameReviewLink", description: "Frame.io review link" },
  { name: "googleDeliverableLink", description: "Google deliverable link" },
  { name: "loomReviewLink", description: "Loom walkthrough link" },
  { name: "animaticReviewLink", description: "Animatic review link" },
  { name: "flexLink", description: "Flexible/custom link" },
  { name: "projectPlanLink", description: "Project plan link from ClickUp" },
  { name: "senderFirstName", description: "Sender's first name" },
  { name: "senderName", description: "Sender's full name" },
];

const DEPARTMENTS = [
  { value: "Pre-Production", label: "Pre-Production" },
  { value: "Design", label: "Design" },
  { value: "Production", label: "Production" },
  { value: "Post-Production", label: "Post-Production" },
];

export default function NewTemplatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [snippet, setSnippet] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [deliverableType, setDeliverableType] = useState("");
  const [department, setDepartment] = useState("");

  // Fetch deliverable type options for the dropdown
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
          snippet,
          subjectLine,
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
        description: "New template has been added to ClickUp.",
      });
      // Navigate to the editor for the new template
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
      {/* Header */}
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
            <h1 className="text-xl font-bold">Create New Template</h1>
            <p className="text-sm text-muted-foreground">
              Add a new delivery snippet template to the ClickUp Delivery
              Snippets list.
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
            <Save className="mr-2 h-4 w-4" />
          )}
          Create Template
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Editor column */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. First Pass Delivery — Design"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subject Line</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={subjectLine}
                onChange={(e) => setSubjectLine(e.target.value)}
                placeholder="Email subject line (supports [variables])"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery Snippet</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={snippet}
                onChange={(e) => setSnippet(e.target.value)}
                placeholder="Template body with [variable] placeholders..."
                className="min-h-[400px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Use [variableName] for simple variables or [Link Text |
                variableName] for linked text.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Variable reference sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" />
                Template Variables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <TooltipProvider>
                  {TEMPLATE_VARIABLES.map((v) => (
                    <Tooltip key={v.name}>
                      <TooltipTrigger asChild>
                        <button
                          className="block w-full text-left text-sm font-mono px-2 py-1 rounded hover:bg-muted transition-colors"
                          onClick={() => {
                            setSnippet((prev) => prev + `[${v.name}]`);
                          }}
                        >
                          [{v.name}]
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p>{v.description}</p>
                        <p className="text-xs mt-1 text-muted-foreground">
                          Click to insert
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

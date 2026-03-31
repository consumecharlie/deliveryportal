"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RichTextEditor, type Editor } from "@/components/shared/rich-text-editor";
import { SlackValidationPanel } from "@/components/shared/slack-validation-panel";
import { TEMPLATE_VARIABLE_META } from "@/components/shared/template-variable-extension";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { DepartmentBadge } from "@/components/dashboard/department-badge";
import {
  ArrowLeft,
  Save,
  Loader2,
  Info,
  History,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Check,
  ChevronsUpDown,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DeliverySnippetTemplate } from "@/lib/types";
import type { SlackLintError } from "@/lib/slack-lint";

/**
 * Replace the old verbose Scope & Timeline section with concise bullet format.
 * Detects the "Scope" / "Timeline" sub-headers and everything between them
 * through the feedback deadline line, then replaces with bullet format.
 */
function modernizeScopeSection(content: string): string {
  const NEW_SECTION = [
    "- **Revision Rounds:** 1 of [revisionRounds]",
    "- **Feedback Windows:** [feedbackWindows]",
    "- **Feedback Deadline:** EOD [nextFeedbackDeadline]",
    "- Additional revisions beyond the included revision rounds will require a scope adjustment.",
  ].join("\n");

  const lines = content.split("\n");

  // Clean helper: strip zero-width chars, bold markers, and trim
  const clean = (s: string) =>
    s.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/\*/g, "").trim().toLowerCase();

  // Find "Scope" sub-header: a short line that is just "scope" (with or without bold/colon)
  const scopeIdx = lines.findIndex((l) => {
    const c = clean(l);
    return c === "scope" || c === "scope:";
  });

  if (scopeIdx < 0) return content;

  // Find the end: the line containing "nextFeedbackDeadline" or "feedbackDeadline",
  // or the next ## header after we've passed at least the Scope+Timeline content
  let endIdx = scopeIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.includes("nextFeedbackDeadline") || line.includes("feedbackDeadline")) {
      endIdx++; // include this line
      break;
    }
    // Stop at a ## header (but not "Timeline" which is part of the old format)
    if (/^#{1,3}\s/.test(line) && endIdx > scopeIdx + 2) break;
    endIdx++;
  }

  // Skip trailing blank lines
  while (endIdx < lines.length && lines[endIdx].trim() === "") {
    endIdx++;
  }

  lines.splice(scopeIdx, endIdx - scopeIdx, ...NEW_SECTION.split("\n"));
  return lines.join("\n");
}

// Template variables grouped by category
const VARIABLE_GROUPS: {
  label: string;
  category: string;
  chipClass: string;
  variables: { name: string; displayLabel: string }[];
}[] = [
  {
    label: "Contact",
    category: "contact",
    chipClass: "template-var-contact",
    variables: Object.entries(TEMPLATE_VARIABLE_META)
      .filter(([, m]) => m.category === "contact")
      .map(([name, m]) => ({ name, displayLabel: m.label })),
  },
  {
    label: "Project",
    category: "project",
    chipClass: "template-var-project",
    variables: Object.entries(TEMPLATE_VARIABLE_META)
      .filter(([, m]) => m.category === "project")
      .map(([name, m]) => ({ name, displayLabel: m.label })),
  },
  {
    label: "Links",
    category: "link",
    chipClass: "template-var-link",
    variables: Object.entries(TEMPLATE_VARIABLE_META)
      .filter(([, m]) => m.category === "link")
      .map(([name, m]) => ({ name, displayLabel: m.label })),
  },
  {
    label: "Sender",
    category: "sender",
    chipClass: "template-var-sender",
    variables: Object.entries(TEMPLATE_VARIABLE_META)
      .filter(([, m]) => m.category === "sender")
      .map(([name, m]) => ({ name, displayLabel: m.label })),
  },
];

interface TemplateVersionRecord {
  id: string;
  templateTaskId: string;
  templateName: string;
  snippet: string;
  subjectLine: string;
  deliverableType: string;
  department: string;
  sender: string;
  editedBy: string;
  editedAt: string;
  changeNote: string | null;
}

interface DropdownOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string;
}

interface MemberOption {
  id: number;
  username: string;
  email: string;
  profilePicture?: string;
  initials: string;
}

interface FieldOptions {
  department: DropdownOption[];
  deliverableType: DropdownOption[];
  sender: MemberOption[];
}

// ─── Searchable Dropdown Combobox ──────────────────────────────────

function SearchableDropdown({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onChange,
  renderOption,
  renderSelected,
}: {
  value: string;
  options: { value: string; label: string; searchValue?: string; color?: string }[];
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  onChange: (value: string) => void;
  renderOption?: (opt: { value: string; label: string; color?: string }, isSelected: boolean) => React.ReactNode;
  renderSelected?: (opt: { value: string; label: string; color?: string } | undefined) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 px-3 font-normal"
        >
          {renderSelected ? (
            renderSelected(selected)
          ) : (
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label || placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.searchValue ?? opt.label}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {renderOption ? (
                      renderOption(opt, isSelected)
                    ) : (
                      <>
                        <span className="flex-1 truncate">{opt.label}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Sender Combobox with profile pictures ────────────────────────

function SenderCombobox({
  value,
  options,
  selectedProfile,
  onChange,
}: {
  value: number | undefined;
  options: MemberOption[];
  selectedProfile?: { name: string; email: string; picture?: string };
  onChange: (userId: number, member: MemberOption) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedMember = options.find((m) => m.id === value);
  const displayName =
    selectedMember?.username || selectedProfile?.name || "Select sender...";
  const displayPicture =
    selectedMember?.profilePicture || selectedProfile?.picture;
  const displayInitials =
    selectedMember?.initials ||
    (selectedProfile?.name
      ? selectedProfile.name
          .split(/[\s.@]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("")
      : "?");
  const hasValue = selectedMember || selectedProfile?.name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-[2.25rem] py-1.5 font-normal"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size="sm">
              {displayPicture ? (
                <AvatarImage src={displayPicture} alt={displayName} />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {displayInitials}
              </AvatarFallback>
            </Avatar>
            <span className={cn("truncate text-sm", !hasValue && "text-muted-foreground")}>
              {displayName}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search team members..." />
          <CommandList>
            <CommandEmpty>No team member found.</CommandEmpty>
            <CommandGroup>
              {options.map((member) => (
                <CommandItem
                  key={member.id}
                  value={`${member.username} ${member.email}`}
                  onSelect={() => {
                    onChange(member.id, member);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Avatar size="sm">
                    {member.profilePicture ? (
                      <AvatarImage
                        src={member.profilePicture}
                        alt={member.username}
                      />
                    ) : null}
                    <AvatarFallback className="text-[10px]">
                      {member.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm truncate">{member.username}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {member.email}
                    </span>
                  </div>
                  {value === member.id && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const taskId = params.taskId as string;

  const [snippet, setSnippet] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const snippetEditorRef = useRef<Editor | null>(null);
  const [deliverableType, setDeliverableType] = useState("");
  const [department, setDepartment] = useState("");
  const [senderUserId, setSenderUserId] = useState<number | undefined>();
  const [senderProfile, setSenderProfile] = useState<{
    name: string;
    email: string;
    picture?: string;
  }>();
  const [hasChanges, setHasChanges] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewVersion, setPreviewVersion] =
    useState<TemplateVersionRecord | null>(null);
  const [confirmRestore, setConfirmRestore] =
    useState<TemplateVersionRecord | null>(null);
  const [slackLintErrors, setSlackLintErrors] = useState<SlackLintError[]>([]);
  const [showLintWarning, setShowLintWarning] = useState(false);

  // Track when we just saved so we can skip overwriting local state
  // on the next refetch (ClickUp may not have processed the update yet).
  const justSavedRef = useRef(false);

  const { data: template, isLoading } = useQuery<DeliverySnippetTemplate>({
    queryKey: ["template", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/templates/edit/${taskId}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
  });

  // Fetch field options from ClickUp
  const { data: fieldOptions } = useQuery<FieldOptions>({
    queryKey: ["template-field-options"],
    queryFn: async () => {
      const res = await fetch("/api/templates/field-options");
      if (!res.ok) throw new Error("Failed to fetch field options");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  // Fetch version history
  const { data: historyData, refetch: refetchHistory } = useQuery<{
    versions: TemplateVersionRecord[];
  }>({
    queryKey: ["template-history", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/templates/history/${taskId}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: historyOpen,
  });

  const versions = historyData?.versions ?? [];

  // Initialize form state when template loads.
  // After a save we skip this so that local edits aren't overwritten by a
  // refetch that may still return stale data from ClickUp.
  useEffect(() => {
    if (template) {
      if (justSavedRef.current) {
        justSavedRef.current = false;
        return;
      }
      setSnippet(template.snippet);
      setSubjectLine(template.subjectLine);
      setDeliverableType(template.deliverableType);
      setDepartment(template.department);
      setSenderUserId(template.senderUserId);
      setSenderProfile({
        name: template.senderName ?? "",
        email: template.senderEmail,
        picture: template.senderProfilePicture,
      });
      setHasChanges(false);
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/templates/edit/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snippet,
          subjectLine,
          deliverableType,
          department,
          sender: senderUserId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save template");
      return res.json();
    },
    onSuccess: () => {
      justSavedRef.current = true;
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template", taskId] });
      queryClient.invalidateQueries({
        queryKey: ["template-history", taskId],
      });
      toast.success("Template saved", {
        description: "Changes written to ClickUp.",
      });
    },
    onError: () => {
      toast.error("Failed to save template");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch(`/api/templates/restore/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) throw new Error("Failed to restore template");
      return res.json();
    },
    onSuccess: (data) => {
      setSnippet(data.restoredVersion.snippet);
      setSubjectLine(data.restoredVersion.subjectLine);
      setHasChanges(false);
      setConfirmRestore(null);
      setPreviewVersion(null);
      queryClient.invalidateQueries({ queryKey: ["template", taskId] });
      queryClient.invalidateQueries({
        queryKey: ["template-history", taskId],
      });
      toast.success("Template restored", {
        description:
          "Reverted to the selected version. Current state was auto-saved.",
      });
    },
    onError: () => {
      toast.error("Failed to restore template");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading template...
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center py-24 text-destructive">
        Template not found.
      </div>
    );
  }

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
            <h1 className="text-xl font-bold">{template.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <DepartmentBadge department={department || template.department} />
              {(deliverableType || template.deliverableType) && (
                <Badge variant="outline">
                  {deliverableType || template.deliverableType}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setHistoryOpen((prev) => !prev);
              if (!historyOpen) refetchHistory();
            }}
          >
            <History className="mr-1 h-4 w-4" />
            History
            {historyOpen ? (
              <ChevronUp className="ml-1 h-3 w-3" />
            ) : (
              <ChevronDown className="ml-1 h-3 w-3" />
            )}
          </Button>
          <Button
            onClick={() => {
              if (slackLintErrors.length > 0) {
                setShowLintWarning(true);
              } else {
                saveMutation.mutate();
              }
            }}
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Version History Panel */}
      {historyOpen && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No previous versions found. Versions are saved each time you
                save the template.
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {versions.map((version) => {
                  const date = new Date(version.editedAt);
                  const isSelected = previewVersion?.id === version.id;
                  return (
                    <div
                      key={version.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() =>
                        setPreviewVersion(isSelected ? null : version)
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span className="text-muted-foreground">
                            {date.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {version.changeNote ??
                            `Edited by ${version.editedBy}`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmRestore(version);
                        }}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Restore
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Version preview diff */}
            {previewVersion && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Version Preview</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmRestore(previewVersion)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Restore This Version
                  </Button>
                </div>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Subject Line
                    </Label>
                    <div className="rounded bg-muted/50 px-3 py-1.5 text-sm">
                      {previewVersion.subjectLine || "(empty)"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Snippet Body
                    </Label>
                    <div className="rounded bg-muted/50 max-h-[250px] overflow-y-auto">
                      <RichTextEditor
                        content={previewVersion.snippet || ""}
                        onChange={() => {}}
                        outputFormat="markdown"
                        editable={false}
                        showToolbar={false}
                        minHeight="auto"
                        enableTemplateVariables={true}
                        className="border-0 bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Editor column */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subject Line</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={subjectLine}
                onChange={(e) => {
                  setSubjectLine(e.target.value);
                  setHasChanges(true);
                }}
                placeholder="Email subject line (supports [variables])"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Delivery Snippet</CardTitle>
              {snippet.includes("revision round") && snippet.includes("feedback windows") && !snippet.includes("**Revision Rounds:**") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Debug: log the raw markdown lines around "scope"
                    const lines = snippet.split("\n");
                    const scopeLines = lines
                      .map((l, i) => ({ i, raw: l, cleaned: l.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/\*/g, "").trim().toLowerCase() }))
                      .filter(({ cleaned }) => cleaned.includes("scope"));
                    console.log("Scope-related lines:", scopeLines);
                    console.log("Full snippet lines:", lines.map((l, i) => `${i}: ${JSON.stringify(l)}`).join("\n"));

                    const updated = modernizeScopeSection(snippet);
                    if (updated === snippet) {
                      toast.error("Could not find the old Scope/Timeline format to replace. Check browser console for debug info.");
                      return;
                    }
                    setSnippet(updated);
                    setHasChanges(true);
                  }}
                  className="text-xs"
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Modernize Scope Section
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <RichTextEditor
                content={snippet}
                onChange={(value) => {
                  setSnippet(value);
                  setHasChanges(true);
                }}
                placeholder="Template body with [variable] placeholders..."
                outputFormat="markdown"
                showToolbar={true}
                minHeight="400px"
                enableTemplateVariables={true}
                onEditorReady={(e) => { snippetEditorRef.current = e; }}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Use [variableName] for simple variables or [Link Text |
                variableName] for linked text. Variables appear as colored chips.
              </p>
              <SlackValidationPanel
                markdown={snippet}
                onLintResult={setSlackLintErrors}
                className="mt-4"
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Template Info - editable */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Template Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Deliverable Type */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Deliverable Type
                </Label>
                {fieldOptions?.deliverableType &&
                fieldOptions.deliverableType.length > 0 ? (
                  <SearchableDropdown
                    value={deliverableType}
                    options={fieldOptions.deliverableType.map((opt) => ({
                      value: opt.name,
                      label: opt.name,
                      color: opt.color,
                    }))}
                    placeholder="Select type..."
                    searchPlaceholder="Search types..."
                    emptyMessage="No type found."
                    onChange={(val) => {
                      setDeliverableType(val);
                      setHasChanges(true);
                    }}
                    renderOption={(opt, isSelected) => (
                      <>
                        {opt.color && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                        )}
                        <span className="flex-1 truncate">{opt.label}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </>
                    )}
                    renderSelected={(opt) => (
                      <span className={cn("truncate flex items-center gap-2", !opt && "text-muted-foreground")}>
                        {opt?.color && (
                          <span
                            className="inline-block h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                        )}
                        {opt?.label || "Select type..."}
                      </span>
                    )}
                  />
                ) : (
                  <p className="text-sm">{deliverableType || "—"}</p>
                )}
              </div>

              <Separator />

              {/* Department */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Department
                </Label>
                {fieldOptions?.department &&
                fieldOptions.department.length > 0 ? (
                  <SearchableDropdown
                    value={department}
                    options={fieldOptions.department.map((opt) => ({
                      value: opt.name,
                      label: opt.name,
                      color: opt.color,
                    }))}
                    placeholder="Select department..."
                    searchPlaceholder="Search departments..."
                    emptyMessage="No department found."
                    onChange={(val) => {
                      setDepartment(val);
                      setHasChanges(true);
                    }}
                    renderOption={(opt, isSelected) => (
                      <>
                        {opt.color && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                        )}
                        <span className="flex-1 truncate">{opt.label}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </>
                    )}
                    renderSelected={(opt) => (
                      <span className={cn("truncate flex items-center gap-2", !opt && "text-muted-foreground")}>
                        {opt?.color && (
                          <span
                            className="inline-block h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                        )}
                        {opt?.label || "Select department..."}
                      </span>
                    )}
                  />
                ) : (
                  <p className="text-sm">{department || "—"}</p>
                )}
              </div>

              <Separator />

              {/* Sender */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sender</Label>
                <SenderCombobox
                  value={senderUserId}
                  options={fieldOptions?.sender ?? []}
                  selectedProfile={senderProfile}
                  onChange={(userId, member) => {
                    setSenderUserId(userId);
                    setSenderProfile({
                      name: member.username,
                      email: member.email,
                      picture: member.profilePicture,
                    });
                    setHasChanges(true);
                  }}
                />
              </div>

              <Separator />

              {/* ClickUp Task ID (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  ClickUp Task ID
                </Label>
                <p className="font-mono text-xs">{template.taskId}</p>
              </div>
            </CardContent>
          </Card>

          {/* Variable reference */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" />
                Template Variables
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Click to insert at cursor. For links, select text first to create a linked variable.
              </p>
              {VARIABLE_GROUPS.map((group) => (
                <div key={group.category}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {group.variables.map((v) => {
                      const isLink = group.category === "link";
                      return (
                        <button
                          key={v.name}
                          className={`template-variable-chip ${group.chipClass} text-xs cursor-pointer hover:opacity-80 transition-opacity`}
                          onClick={() => {
                            const ed = snippetEditorRef.current;
                            if (!ed) {
                              // Fallback: append to markdown
                              setSnippet((prev) => prev + `[${v.name}]`);
                              setHasChanges(true);
                              return;
                            }

                            const { from, to } = ed.state.selection;
                            const selectedText = ed.state.doc.textBetween(from, to);

                            if (isLink && selectedText) {
                              // Wrap selected text as a linked variable: [selected text | variableName]
                              ed.chain()
                                .focus()
                                .deleteSelection()
                                .insertContent(`[${selectedText} | ${v.name}]`)
                                .run();
                            } else if (isLink) {
                              // Insert link variable with a prompt for label text
                              const label = window.prompt(
                                `Enter display text for this link (or leave blank for just the variable):`,
                                v.displayLabel
                              );
                              if (label === null) return; // cancelled
                              const text = label.trim()
                                ? `[${label.trim()} | ${v.name}]`
                                : `[${v.name}]`;
                              ed.chain().focus().insertContent(text).run();
                            } else {
                              // Regular variable: insert at cursor
                              ed.chain().focus().insertContent(`[${v.name}]`).run();
                            }
                            setHasChanges(true);
                          }}
                          title={isLink
                            ? `Insert [${v.name}] — select text first to create a linked variable`
                            : `Insert [${v.name}]`
                          }
                        >
                          {v.displayLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Slack Lint Warning Dialog */}
      <AlertDialog open={showLintWarning} onOpenChange={setShowLintWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Slack Formatting Issues
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This template has {slackLintErrors.length} formatting{" "}
                  {slackLintErrors.length === 1 ? "issue" : "issues"} that may
                  not render correctly in Slack:
                </p>
                <ul className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  {slackLintErrors.map((err, i) => (
                    <li
                      key={i}
                      className="text-xs text-amber-700 dark:text-amber-400"
                    >
                      <span className="font-mono">Line {err.line}:</span>{" "}
                      {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowLintWarning(false);
                saveMutation.mutate();
              }}
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={!!confirmRestore}
        onOpenChange={(open) => !open && setConfirmRestore(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Template Version</DialogTitle>
            <DialogDescription>
              This will revert the template to the version from{" "}
              {confirmRestore &&
                new Date(confirmRestore.editedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              . Your current version will be auto-saved to the history before
              restoring.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRestore(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                confirmRestore && restoreMutation.mutate(confirmRestore.id)
              }
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

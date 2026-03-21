"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { convertToSlackFormat } from "@/lib/template-merge";
import { lintSlackMrkdwn, type SlackLintError } from "@/lib/slack-lint";
import { SlackMrkdwnRenderer } from "./slack-mrkdwn-renderer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface SlackValidationPanelProps {
  markdown: string; // Raw markdown BEFORE conversion
  className?: string;
  onLintResult?: (errors: SlackLintError[]) => void;
}

export function SlackValidationPanel({
  markdown,
  className,
  onLintResult,
}: SlackValidationPanelProps) {
  const [converted, setConverted] = useState("");
  const [errors, setErrors] = useState<SlackLintError[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLintResultRef = useRef(onLintResult);
  onLintResultRef.current = onLintResult;

  // Debounced conversion + linting
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const result = convertToSlackFormat(markdown);
      setConverted(result);

      const lintErrors = lintSlackMrkdwn(result);
      setErrors(lintErrors);
      onLintResultRef.current?.(lintErrors);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [markdown]);

  // Build a set of line numbers that have errors for the source view
  const errorLineMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const err of errors) {
      const existing = map.get(err.line) ?? [];
      existing.push(err.message);
      map.set(err.line, existing);
    }
    return map;
  }, [errors]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const sourceLines = converted.split("\n");

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
    >
      {/* Collapsible header */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              collapsed && "-rotate-90"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
          Slack Format Validation
        </span>
        {errors.length > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {errors.length} {errors.length === 1 ? "issue" : "issues"}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {/* Lint error banner */}
          {errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setErrorsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-sm text-amber-800 dark:text-amber-300"
              >
                <span className="font-medium">
                  {errors.length} formatting{" "}
                  {errors.length === 1 ? "issue" : "issues"} detected
                </span>
                <svg
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    errorsExpanded && "rotate-180"
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {errorsExpanded && (
                <ul className="mt-2 space-y-1">
                  {errors.map((err, i) => (
                    <li
                      key={i}
                      className="text-xs text-amber-700 dark:text-amber-400"
                    >
                      <span className="font-mono">Line {err.line}:</span>{" "}
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Tabbed content */}
          <Tabs defaultValue="preview">
            <div className="border-b border-border px-4">
              <TabsList variant="line" className="h-9">
                <TabsTrigger value="preview" className="text-xs">
                  Slack Markdown Preview
                </TabsTrigger>
                <TabsTrigger value="source" className="text-xs">
                  Slack Source
                  {errors.length > 0 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      ({errors.length})
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="preview">
              <div className="border rounded-md border-border m-3 bg-white dark:bg-[#1A1D21]">
                <SlackMrkdwnRenderer content={converted} />
              </div>
            </TabsContent>

            <TabsContent value="source">
              <div className="m-3 overflow-x-auto">
                <pre className="text-[13px] leading-relaxed font-mono">
                  {sourceLines.map((line, i) => {
                    const lineNum = i + 1;
                    const lineErrors = errorLineMap.get(lineNum);
                    const hasError = !!lineErrors;

                    return (
                      <React.Fragment key={i}>
                        <div
                          className={cn(
                            "px-3 py-0.5",
                            hasError &&
                              "border-l-2 border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20"
                          )}
                        >
                          <span className="inline-block w-8 text-right mr-3 text-muted-foreground select-none text-[11px]">
                            {lineNum}
                          </span>
                          {line || "\u00A0"}
                        </div>
                        {lineErrors?.map((msg, j) => (
                          <div
                            key={`${i}-err-${j}`}
                            className="pl-14 pr-3 py-0.5 text-[11px] text-red-500 dark:text-red-400 bg-red-50/50 dark:bg-red-950/10"
                          >
                            {msg}
                          </div>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

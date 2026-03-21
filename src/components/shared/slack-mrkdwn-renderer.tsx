"use client";

import React from "react";
import { SLACK_EMOJI_MAP } from "@/lib/template-merge";
import { cn } from "@/lib/utils";

interface SlackMrkdwnRendererProps {
  content: string; // Already-converted mrkdwn from convertToSlackFormat()
  className?: string;
}

/**
 * Build a reverse map from Slack shortcode → Unicode emoji.
 * Includes all entries from SLACK_EMOJI_MAP plus a few common extras.
 */
function buildReverseEmojiMap(): Record<string, string> {
  const reverse: Record<string, string> = {};
  for (const [unicode, shortcode] of Object.entries(SLACK_EMOJI_MAP)) {
    reverse[shortcode] = unicode;
  }
  // Add common shortcodes that may not be in the forward map
  reverse[":white_check_mark:"] ??= "\u2705";
  reverse[":heavy_check_mark:"] ??= "\u2714\uFE0F";
  reverse[":x:"] ??= "\u274C";
  reverse[":warning:"] ??= "\u26A0\uFE0F";
  reverse[":eyes:"] ??= "\uD83D\uDC40";
  reverse[":wave:"] ??= "\uD83D\uDC4B";
  reverse[":heart:"] ??= "\u2764\uFE0F";
  reverse[":sparkles:"] ??= "\u2728";
  reverse[":pray:"] ??= "\uD83D\uDE4F";
  reverse[":raised_hands:"] ??= "\uD83D\uDE4C";
  reverse[":point_right:"] ??= "\uD83D\uDC49";
  reverse[":mega:"] ??= "\uD83D\uDCE3";
  reverse[":hourglass:"] ??= "\u231B";
  reverse[":calendar:"] ??= "\uD83D\uDCC6";
  reverse[":movie_camera:"] ??= "\uD83C\uDFA5";
  reverse[":clapper:"] ??= "\uD83C\uDFAC";
  return reverse;
}

const REVERSE_EMOJI_MAP = buildReverseEmojiMap();

/**
 * Parse a single line of Slack mrkdwn into React elements.
 * Handles: *bold*, <url|text>, <@userId>, :shortcode:, and plain text.
 */
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    // Find the earliest special token
    const slackTokenMatch = remaining.match(
      /(<[^>]+>)|(\*[^*\n]+\*)|(:[\w+-]+:)/
    );

    if (!slackTokenMatch || slackTokenMatch.index === undefined) {
      // No more tokens — push remaining as plain text
      elements.push(
        <span key={`${keyPrefix}-${idx++}`}>{remaining}</span>
      );
      break;
    }

    const matchIndex = slackTokenMatch.index;
    const matchStr = slackTokenMatch[0];

    // Push any plain text before this match
    if (matchIndex > 0) {
      elements.push(
        <span key={`${keyPrefix}-${idx++}`}>
          {remaining.slice(0, matchIndex)}
        </span>
      );
    }

    if (slackTokenMatch[1]) {
      // Slack angle-bracket token: <url|text> or <@userId>
      const inner = matchStr.slice(1, -1);

      if (inner.startsWith("@")) {
        // Mention: <@userId>
        const userId = inner.slice(1);
        elements.push(
          <span
            key={`${keyPrefix}-${idx++}`}
            className="inline-flex items-center rounded-[3px] px-1 py-0.5 text-[13px] font-medium bg-[#E8F0FE] text-[#1264A3] dark:bg-[#1D3B5C] dark:text-[#4A9BD9]"
          >
            @{userId}
          </span>
        );
      } else {
        // Link: <url|text> or just <url>
        const pipeIdx = inner.indexOf("|");
        const url = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
        const linkText = pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner;
        elements.push(
          <a
            key={`${keyPrefix}-${idx++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#1264A3] dark:text-[#4A9BD9] hover:text-[#0e4f82] dark:hover:text-[#6db8f0]"
          >
            {linkText}
          </a>
        );
      }
    } else if (slackTokenMatch[2]) {
      // Bold: *text* — recursively parse inner content for emoji shortcodes
      const boldText = matchStr.slice(1, -1);
      elements.push(
        <strong key={`${keyPrefix}-${idx++}`} className="font-bold">
          {parseInline(boldText, `${keyPrefix}-b${idx}`)}
        </strong>
      );
    } else if (slackTokenMatch[3]) {
      // Emoji shortcode: :shortcode:
      const shortcode = matchStr;
      const emoji = REVERSE_EMOJI_MAP[shortcode];
      if (emoji) {
        elements.push(
          <span key={`${keyPrefix}-${idx++}`} title={shortcode}>
            {emoji}
          </span>
        );
      } else {
        // Unknown shortcode — render as-is
        elements.push(
          <span key={`${keyPrefix}-${idx++}`}>{shortcode}</span>
        );
      }
    }

    remaining = remaining.slice(matchIndex + matchStr.length);
  }

  return elements;
}

/**
 * Renders Slack mrkdwn as it would appear in Slack.
 * Parses line-by-line and produces React elements (no dangerouslySetInnerHTML).
 */
export function SlackMrkdwnRenderer({
  content,
  className,
}: SlackMrkdwnRendererProps) {
  // Split on newlines, preserving empty lines for paragraph breaks.
  // Collapse 3+ newlines to 2 (Slack behavior).
  const normalized = content.replace(/\n{3,}/g, "\n\n");
  const lines = normalized.split("\n");

  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line = paragraph break
    if (line === "") {
      // Collapse consecutive empty lines
      while (i + 1 < lines.length && lines[i + 1] === "") {
        i++;
      }
      elements.push(
        <div key={`gap-${i}`} className="h-3" aria-hidden="true" />
      );
      i++;
      continue;
    }

    // Check for em-space bullet pattern: \u2003\u2003•\u2002
    const bulletMatch = line.match(/^\u2003\u2003•\u2002(.*)$/);
    if (bulletMatch) {
      elements.push(
        <div key={`line-${i}`} className="flex gap-1.5 pl-4">
          <span className="shrink-0 select-none" aria-hidden="true">
            •
          </span>
          <span>{parseInline(bulletMatch[1], `b${i}`)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Regular line
    elements.push(
      <div key={`line-${i}`}>{parseInline(line, `l${i}`)}</div>
    );
    i++;
  }

  return (
    <div
      className={cn(
        "p-4 font-[system-ui] text-[15px] leading-[1.46667] text-[#1D1C1D] dark:text-[#D1D2D3]",
        className
      )}
    >
      {elements}
    </div>
  );
}

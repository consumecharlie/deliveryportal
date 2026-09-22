"use client";

import { useEffect, useState } from "react";
import type { PortalLink } from "@/lib/portal-page-model";
import { MessagePopover } from "./message-popover";
import { ConfirmButton } from "./confirm-button";
import { LinkIcon } from "./link-icon";
import { ViewLink } from "./view-link";
import { linkHint, linkInstruction, linkKind, orderedLinks } from "./link-meta";
import { allDone, readSteps, writeSteps } from "./review-steps";

interface Props {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  token: string;
  deliveryId: string;
  title: string;
  links: PortalLink[];
  /** The confirm control at the end of the flow, when there is one to show. */
  confirm: { deliveryId: string; initialConfirmed: boolean; canUndo: boolean } | null;
}

/**
 * Guided review: every link we sent, in the order we meant them to be worked
 * through, each with the sentence that says what to do with it. Steps can be
 * ticked off as a progress aid, and once they all are the confirm button is
 * nudged, so the flow closes where it should: read, open, tick, confirm.
 */
export function ReviewPopover({ open, anchor, onClose, token, deliveryId, title, links, confirm }: Props) {
  const steps = orderedLinks(links);
  const urls = steps.map((l) => l.url);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only store, read once the popover opens
    setDone(readSteps(token, deliveryId));
  }, [open, token, deliveryId]);

  function toggleStep(url: string) {
    setDone((cur) => {
      const next = cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url];
      writeSteps(token, deliveryId, next);
      return next;
    });
  }

  const finished = allDone(urls, done);

  return (
    <MessagePopover open={open} anchor={anchor} title={title} onClose={onClose}>
      <div className="portal-guide">
        <p className="portal-guide-lede">
          {steps.length} {steps.length === 1 ? "thing" : "things"} to look at. Tick them off as you go.
        </p>
        <ol className="portal-guide-steps">
          {steps.map((link, i) => {
            const instruction = linkInstruction(link);
            const ticked = done.includes(link.url);
            return (
              <li key={link.url} className={`portal-guide-step${ticked ? " portal-guide-step-done" : ""}`}>
                <label className="portal-guide-tick">
                  <input type="checkbox" checked={ticked} onChange={() => toggleStep(link.url)} />
                  <span className="portal-guide-num" aria-hidden="true">
                    {i + 1}
                  </span>
                </label>
                <div className="portal-guide-body">
                  {instruction ? (
                    <p className="portal-guide-say">{instruction}</p>
                  ) : (
                    <p className="portal-guide-say portal-guide-say-plain">
                      Open {link.label} {linkHint(link) === link.label ? "" : `on ${linkHint(link)}`}
                    </p>
                  )}
                  <ViewLink
                    token={token}
                    deliveryId={deliveryId}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-btn portal-btn-sm portal-quietbtn portal-linkbtn"
                    onClick={() => {
                      if (!ticked) toggleStep(link.url);
                    }}
                  >
                    <LinkIcon kind={linkKind(link)} className="portal-linkbtn-icon" />
                    <span className="portal-linkbtn-text">
                      <span className="portal-linkbtn-label">{link.label}</span>
                      <span className="portal-linkbtn-hint">{linkHint(link)}</span>
                    </span>
                  </ViewLink>
                </div>
              </li>
            );
          })}
        </ol>
        {confirm && (
          <div className="portal-guide-close">
            <p className="portal-guide-done-say">
              {finished ? "That is everything. Let us know your feedback is in." : "When you have been through them all:"}
            </p>
            <ConfirmButton
              token={token}
              deliveryId={confirm.deliveryId}
              initialConfirmed={confirm.initialConfirmed}
              canUndo={confirm.canUndo}
              appearance="quiet"
              nudge={finished}
            />
          </div>
        )}
      </div>
    </MessagePopover>
  );
}

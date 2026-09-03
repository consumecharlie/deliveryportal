"use client";

import { useId, useState } from "react";

interface Props {
  label: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A button that opens an inline panel with a short height and opacity
 * transition. Content stays in the DOM (so anchors inside it resolve) but is
 * inert while collapsed.
 */
export function Disclosure({ label, defaultOpen = false, className, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        className="portal-disclosure-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`portal-chevron${open ? " portal-chevron-open" : ""}`} aria-hidden="true" />
        {label}
      </button>
      <div id={id} className={`portal-expand${open ? " portal-expand-open" : ""}`} inert={!open}>
        <div className="portal-expand-inner">{children}</div>
      </div>
    </div>
  );
}

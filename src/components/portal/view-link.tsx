"use client";

import type { AnchorHTMLAttributes } from "react";
import { sendPortalView } from "@/lib/portal-view-beacon";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  token: string;
  deliveryId: string;
}

/** An outbound review link that logs a per-delivery view on first click. */
export function ViewLink({ token, deliveryId, onClick, children, ...rest }: Props) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        sendPortalView(token, deliveryId);
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}

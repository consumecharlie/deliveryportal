"use client";

import React from "react";

/**
 * Consume Media's signature retro offset-shadow button (pixel ALL-CAPS label).
 * Copied from the MOGRT Library `Button.tsx`; the shape, hover-to-yellow
 * flip, and press-into-shadow mechanic live in `.cm-btn` (globals.css, portal
 * block, light-body variant: stroke and shadow #151919).
 *
 * Pass plain-cased children - the component uppercases via CSS. Renders an
 * <a> when `href` is set, otherwise a <button>.
 */
export type ButtonVariant = "primary" | "secondary" | "dark" | "cta" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "",
  secondary: "cm-btn--secondary",
  dark: "cm-btn--dark",
  cta: "cm-btn--cta",
  danger: "cm-btn--danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "cm-btn--sm",
  md: "",
  lg: "cm-btn--lg",
};

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only button (e.g. a compact close control). */
  iconOnly?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type ButtonAsButton = BaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & { href?: undefined };
type ButtonAsAnchor = BaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

function classes(variant: ButtonVariant, size: ButtonSize, iconOnly: boolean, extra: string) {
  return ["cm-btn", VARIANT_CLASS[variant], SIZE_CLASS[size], iconOnly ? "cm-btn--icon" : "", extra]
    .filter(Boolean)
    .join(" ");
}

export default function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", iconOnly = false, className = "", children, ...rest } = props;
  const cls = classes(variant, size, iconOnly, className);

  if (rest && "href" in rest && (rest as { href?: string }).href !== undefined) {
    return (
      <a className={cls} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}

export { Button as CmButton };

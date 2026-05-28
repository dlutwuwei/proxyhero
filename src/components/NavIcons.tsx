import type { ReactNode, SVGProps } from "react";
import type { NavPage } from "../types";

function Icon({
  children,
  ...props
}: { children: ReactNode } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

const icons: Record<NavPage, ReactNode> = {
  traffic: (
    <Icon>
      <path d="M4 7h11M4 11h14M4 15h9" />
      <path d="M17.5 8.5v7M20 10v4M15 11v2" />
    </Icon>
  ),
  rules: (
    <Icon>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 7.8l7.6 7.6" />
      <path d="M14 6h4v4" />
      <path d="M6 14v4h4" />
    </Icon>
  ),
  ssl: (
    <Icon>
      <path d="M12 3l7 3.5v5.5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6.5L12 3z" />
      <rect x="9" y="11" width="6" height="5" rx="1" />
      <path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" />
    </Icon>
  ),
  certificate: (
    <Icon>
      <path d="M8 4h8l2 3v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7l2-3z" />
      <path d="M9 8h6" />
      <path d="M9 11h6" />
      <circle cx="12" cy="16" r="2.25" />
      <path d="M10.6 16l1 1 2.2-2.2" />
    </Icon>
  ),
  settings: (
    <Icon>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
};

export function NavIcon({ page }: { page: NavPage }) {
  return icons[page];
}

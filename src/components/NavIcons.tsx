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
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
    </Icon>
  ),
};

export function NavIcon({ page }: { page: NavPage }) {
  return icons[page];
}

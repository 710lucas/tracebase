import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const SECTIONS = [
  { to: "/", label: "Status" },
  { to: "/imports", label: "Imports" },
  { to: "/browse", label: "Browse" },
];

// The frame of every screen: the name, the three sections and the page itself.
export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="top">
        <strong className="brand">tracebase</strong>
        <nav>
          {SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.to === "/"}>
              {section.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";

const SETTINGS_SECTIONS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/floor-sheets-schedules", label: "Floor, Sheets and Schedules" },
  { href: "/settings/servers", label: "Servers" },
];

export function SettingsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content settings-main-content">
        <div className="settings-page">
          <header className="settings-header">
            <p>Restaurant setup</p>
            <h1>Settings</h1>
            <span>Configure the structure behind reservations and daily service.</span>
          </header>

          <nav className="settings-section-nav" aria-label="Settings sections">
            <ul>
              {SETTINGS_SECTIONS.map((section) => (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    aria-current={pathname === section.href ? "page" : undefined}
                  >
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {children}
        </div>
      </main>
    </div>
  );
}

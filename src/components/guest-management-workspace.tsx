"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { GuestManagement } from "@/components/guest-management";

export function GuestManagementWorkspace() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content guest-main-content">
        <GuestManagement />
      </main>
    </div>
  );
}

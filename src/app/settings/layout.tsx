import { ReactNode } from "react";
import { SettingsWorkspace } from "@/components/settings-workspace";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsWorkspace>{children}</SettingsWorkspace>;
}

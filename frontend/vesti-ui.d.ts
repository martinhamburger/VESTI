declare module "@vesti/ui" {
  import type { ReactElement } from "react";
  import type { StorageApi, UiThemeMode } from "../packages/vesti-ui/src/types";

  export interface VestiDashboardProps {
    storage: StorageApi;
    logoSrc: string;
    logoAlt?: string;
    rootClassName?: string;
    themeMode?: UiThemeMode;
    onToggleTheme?: () => Promise<void> | void;
    themeSyncStatus?: "idle" | "syncing" | "error";
    themeSyncMessage?: string | null;
  }

  export function VestiDashboard(props: VestiDashboardProps): ReactElement;
}

import "~style.css";

import { useEffect } from "react";
import {
  applyUiTheme,
  initializeUiTheme,
  subscribeUiSettings,
} from "~lib/services/uiSettingsService";
import { VestiSidepanel } from "./VestiSidepanel";

void initializeUiTheme().catch(() => {
  // Ignore theme initialization failures and keep default light tokens.
});

function VestiSidepanelPage() {
  useEffect(() => {
    const unsubscribe = subscribeUiSettings((settings) => {
      applyUiTheme(settings.themeMode);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return <VestiSidepanel />;
}

export default VestiSidepanelPage;

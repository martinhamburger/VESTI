import { DataManagementPanel } from "../components/DataManagementPanel";
import { DisclosureSection } from "../components/DisclosureSection";

export function DataPage() {
  return (
    <div className="vesti-shell flex h-full flex-col overflow-y-auto vesti-scroll bg-bg-app">
      <header className="flex h-8 shrink-0 items-center px-4">
        <h1 className="vesti-page-title text-text-primary">Data</h1>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <DisclosureSection
          title="Data Operations"
          description="Storage usage, exports, and local cleanup controls."
        >
          <DataManagementPanel />
        </DisclosureSection>
      </div>
    </div>
  );
}

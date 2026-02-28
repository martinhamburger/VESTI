import { DataManagementPanel } from "../components/DataManagementPanel";

export function DataPage() {
  return (
    <div className="vesti-shell data-page-shell">
      <header className="vesti-page-header">
        <h1 className="vesti-page-title text-text-primary">Data</h1>
      </header>

      <div className="data-page-scroll vesti-scroll">
        <DataManagementPanel />
      </div>
    </div>
  );
}

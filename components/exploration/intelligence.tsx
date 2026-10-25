import {
  type Dataset,
  type Profile,
  type FilterClause,
} from "@/lib/data-engine";
import { type WorkspaceTools } from "@/lib/workspace-tools";
import { type WorkflowPlan } from "@/lib/workbench";
import { WorkflowPanel } from "./workflow-panel";
import { KnowledgePanel } from "./knowledge-panel";
export function IntelligenceWorkspace({
  dataset,
  profile,
  filters,
  tools,
  onChange,
  onInspect,
  onExport,
  onOpenDiagnostic,
}: {
  dataset: Dataset;
  profile: Profile;
  filters: FilterClause[];
  tools: WorkspaceTools;
  onChange: (tools: Partial<WorkspaceTools>) => void;
  onInspect: (source: Dataset, title: string) => void;
  onExport: (name: string, text: string) => void;
  onOpenDiagnostic: (plan: WorkflowPlan) => void;
}) {
  return (
    <div className="diagnostic-stack">
      <WorkflowPanel
        dataset={dataset}
        profile={profile}
        filters={filters}
        state={tools.workflow}
        onChange={(workflow) => onChange({ workflow })}
        documents={tools.documents}
        metrics={tools.metrics}
        onInspect={onInspect}
        onExport={onExport}
        onOpenDiagnostic={onOpenDiagnostic}
      />
      <KnowledgePanel
        documents={tools.documents}
        onChange={(documents) => onChange({ documents })}
      />
    </div>
  );
}

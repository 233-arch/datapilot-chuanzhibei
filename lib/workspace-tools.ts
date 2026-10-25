import { type Dataset, type Profile } from "./data-engine";
import {
  defaultDiagnostic,
  restoreDiagnostic,
  restoreWorkflow,
  validateMetric,
  type DiagnosticState,
  type SavedMetric,
  type WorkflowState,
} from "./workbench";
import { type KnowledgeDocument, validateDocuments } from "./knowledge";
export type WorkspaceTools = {
  datasetId: string;
  diagnostic: DiagnosticState;
  metrics: SavedMetric[];
  documents: KnowledgeDocument[];
  workflow: WorkflowState;
};
export function defaultTools(
  dataset: Dataset,
  profile: Profile,
): WorkspaceTools {
  return {
    datasetId: dataset.id,
    diagnostic: defaultDiagnostic(dataset, profile),
    metrics: [],
    documents: [],
    workflow: { question: "", plan: null },
  };
}
export function restoreTools(
  value: unknown,
  dataset: Dataset,
  profile: Profile,
): WorkspaceTools {
  const initial = defaultTools(dataset, profile);
  if (
    !value ||
    typeof value !== "object" ||
    !("datasetId" in value) ||
    value.datasetId !== dataset.id
  )
    return initial;
  const v = value as Partial<WorkspaceTools>;
  let metrics: SavedMetric[] = [],
    documents: KnowledgeDocument[] = [];
  try {
    if (Array.isArray(v.metrics) && v.metrics.length <= 12) {
      metrics = v.metrics.map((m) => validateMetric(m, profile));
      if (
        new Set(metrics.map((m) => m.id)).size !== metrics.length ||
        new Set(metrics.map((m) => m.name)).size !== metrics.length
      )
        metrics = [];
    }
  } catch {
    metrics = [];
  }
  try {
    documents = validateDocuments(v.documents);
  } catch {
    documents = [];
  }
  return {
    datasetId: dataset.id,
    diagnostic: restoreDiagnostic(v.diagnostic, dataset, profile),
    metrics,
    documents,
    workflow: restoreWorkflow(v.workflow, profile),
  };
}

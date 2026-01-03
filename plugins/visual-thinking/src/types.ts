/**
 * Diagram types supported by visual-thinking
 */
export type DiagramType =
  | 'mindmap'
  | 'flowchart'
  | 'sequence'
  | 'architecture'
  | 'erd'
  | 'classDiagram'
  | 'stateDiagram'
  | 'gantt'
  | 'other';

/**
 * A version snapshot of a diagram
 */
export interface DiagramVersion {
  mermaid: string;
  timestamp: string;
  note?: string;
}

/**
 * A stored diagram
 */
export interface Diagram {
  id: string;
  title: string;
  type: DiagramType;
  mermaid: string;
  context: string;
  scope: string;
  created: string;
  updated: string;
  versions: DiagramVersion[];
  tags: string[];
}

/**
 * Input for creating a diagram
 */
export interface CreateDiagramInput {
  title: string;
  type: DiagramType;
  mermaid: string;
  context: string;
  scope?: string;
  tags?: string[];
}

/**
 * Input for updating a diagram
 */
export interface UpdateDiagramInput {
  id: string;
  mermaid?: string;
  title?: string;
  context?: string;
  tags?: string[];
  note?: string;
}

/**
 * Input for listing diagrams
 */
export interface ListDiagramsInput {
  scope?: string;
  type?: DiagramType;
  tags?: string[];
  limit?: number;
}

/**
 * Input for exporting a diagram
 */
export interface ExportDiagramInput {
  id: string;
  format: 'mermaid' | 'svg' | 'drawio';
}

/**
 * Row format in SQLite
 */
export interface DiagramRow {
  id: string;
  title: string;
  type: string;
  mermaid: string;
  context: string;
  scope: string;
  created_at: string;
  updated_at: string;
  versions_json: string;
  tags_json: string;
}

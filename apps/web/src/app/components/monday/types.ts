/** Column types in the board */
export type ColumnType = "text" | "status" | "number" | "date" | "product" | "item";

export type Column = {
  id: string;
  /** Display label */
  title: string;
  type: ColumnType;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  hidden: boolean;
  sticky?: boolean;
  resizable?: boolean;
  sortable?: boolean;
  editable?: boolean;
  movable?: boolean;
  hasSummary?: boolean;
  supportsNote?: boolean;
  color?: string;
};

export type StatusOption = { id: string; label: string; color: string };

export type Item = {
  id: string;
  name: string;
  cells: Record<string, string | number>;
  /** Notes per column (e.g. status column id -> note text) */
  cellNotes?: Record<string, string>;
  assignee?: string;
  contactId?: string | null;
  contactName?: string | null;
};

export type Group = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  itemIds: string[];
  /** Volitelný podnázev / wizard kroky */
  subtitle?: string;
};

export type BoardView = {
  id: string;
  name: string;
  columns: Column[];
  sort?: { columnId: string; dir: "asc" | "desc" };
  filter?: { status?: string; bjMin?: number; bjMax?: number };
  groupBy?: "none" | "status";
};

export type Board = {
  id: string;
  name: string;
  views: BoardView[];
  groups: Group[];
  items: Record<string, Item>;
};

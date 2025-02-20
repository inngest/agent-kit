export interface Contact {
  id?: string;
  fullName: string;
  email: string;
  position?: string;
  company?: string;
  ranking?: string;
}

export interface ColumnMapping {
  fullName: string;
  email: string;
  position?: string;
  company?: string;
  ranking?: string;
}

export type ImportStep = "upload" | "mapping" | "import";

export const IDENTIFY_FIELDS = ["fullName", "email"];
export const MAP_FIELDS = IDENTIFY_FIELDS.concat([
  "position",
  "company",
  "ranking",
]);

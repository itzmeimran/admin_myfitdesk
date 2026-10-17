export type CleanupInspection = {
  checkedAt: string;
  database: { status: string; detail: string };
  files: { status: string; detail: string };
  accounts: { status: string; detail: string };
};

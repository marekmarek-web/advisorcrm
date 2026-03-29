/**
 * Detect Postgres undefined_column (42703) or driver messages mentioning a missing column.
 */
export function isPostgresUndefinedColumnError(err: unknown, columnName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string };
  const code = typeof o.code === "string" ? o.code : "";
  const msg = typeof o.message === "string" ? o.message : String(err);
  const col = columnName.toLowerCase();
  if (code === "42703") return msg.toLowerCase().includes(col);
  return (
    msg.toLowerCase().includes(col) &&
    (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("undefined column"))
  );
}

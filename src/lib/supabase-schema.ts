const schemaErrorCodes = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export function isSupabaseSchemaMismatch(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  if (typeof candidate.code === "string" && schemaErrorCodes.has(candidate.code)) return true;

  const message = [candidate.message, candidate.details]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return /schema cache|could not find (?:the )?(?:table|column)|relation .+ does not exist|column .+ does not exist/i.test(message);
}

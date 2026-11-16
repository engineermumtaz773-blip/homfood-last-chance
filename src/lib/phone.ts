import { z } from "zod";

export function normalizePakistaniPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("+")
    ? compact
    : compact.startsWith("0")
      ? `+92${compact.slice(1)}`
      : compact.startsWith("92")
        ? `+${compact}`
        : `+92${compact}`;
  return /^\+923\d{9}$/.test(normalized) ? normalized : null;
}

export const pakistaniPhoneSchema = z.string().transform((value, context) => {
  const phone = normalizePakistaniPhone(value);
  if (!phone) {
    context.addIssue({ code: "custom", message: "Enter a valid Pakistani mobile number." });
    return z.NEVER;
  }
  return phone;
});

export function getFriendlyGoogleAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  if (normalized.includes("unsupported provider") || normalized.includes("provider is not enabled")) {
    return "Google sign-in is not enabled for this project yet. Please use email OTP, or ask the site administrator to enable Google under Supabase Authentication providers.";
  }
  if (normalized.includes("redirect") && (normalized.includes("allow") || normalized.includes("url"))) {
    return "Google sign-in was blocked because this callback URL is not allowed. Ask the site administrator to add this site under Supabase Authentication URL settings.";
  }
  if (normalized.includes("access_denied") || normalized.includes("cancelled")) {
    return "Google sign-in was cancelled. You can try again or use email OTP.";
  }
  return "Google sign-in could not be completed. Please try again or use email OTP.";
}

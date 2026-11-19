export function getPaymentSlipStoragePath(value: string, supabaseUrl: string) {
  const publicPrefix = "/storage/v1/object/public/payment-slips/";
  const signedPrefix = "/storage/v1/object/sign/payment-slips/";
  const privatePrefix = "/storage/v1/object/payment-slips/";
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.origin !== new URL(supabaseUrl).origin) return null;
      const prefix = [publicPrefix, signedPrefix, privatePrefix].find((candidate) => parsed.pathname.startsWith(candidate));
      if (!prefix) return null;
      value = decodeURIComponent(parsed.pathname.slice(prefix.length));
    } catch {
      return null;
    }
  }

  const segments = value.split("/");
  if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.map(encodeURIComponent).join("/");
}

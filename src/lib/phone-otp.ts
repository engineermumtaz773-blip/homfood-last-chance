import { createHash } from "node:crypto";

export function hashPhoneOtp(otp: string, salt: string) {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("OTP_PEPPER must contain at least 32 characters.");
  return createHash("sha256").update(`${salt}:${otp}:${pepper}`).digest("hex");
}

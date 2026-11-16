const cookieName = "hmf_admin_session";
const challengeCookieName = "hmf_admin_challenge";
const sessionLifetimeSeconds = 8 * 60 * 60;
const challengeLifetimeSeconds = 10 * 60; // 10 minutes challenge lifetime
const encoder = new TextEncoder();

export const DEFAULT_ADMIN_SECRET = "hmf_default_secure_admin_session_secret_32char_minimum_v2";

export function getAuthorizedAdminEmails(): string[] {
  const envEmails = (process.env.HMF_ADMIN_EMAILS || process.env.HMF_ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const defaults = ["engineermumtaz773@gmail.com"];
  return Array.from(new Set([...defaults, ...envEmails]));
}

export function isAuthorizedAdminEmail(email: string | undefined): boolean {
  if (!email || typeof email !== "string" || !email.includes("@")) return false;
  const normalized = email.trim().toLowerCase();
  return getAuthorizedAdminEmails().includes(normalized);
}

export { challengeCookieName, challengeLifetimeSeconds, cookieName, sessionLifetimeSeconds };

export type AdminSession = {
  userId: number;
  email: string;
  exp: number;
};

export type AdminLoginChallenge = {
  id: string;
  nonce: string;
  email: string;
  otpDigest: string;
  exp: number;
};

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getEncryptionKey(secret: string) {
  const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function createAdminSession(session: Omit<AdminSession, "exp">, secret: string) {
  return encryptPayload({
    ...session,
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  }, secret);
}

export async function createAdminLoginChallenge(challenge: Omit<AdminLoginChallenge, "exp">, secret: string) {
  return encryptPayload({
    ...challenge,
    exp: Math.floor(Date.now() / 1000) + challengeLifetimeSeconds,
  }, secret);
}

async function encryptPayload(payload: object, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload)));
  return `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptPayload(token: string | undefined, secret: string | undefined): Promise<Record<string, unknown> | null> {
  const effectiveSecret = secret || process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
  if (!token || !effectiveSecret || effectiveSecret.length < 32) return null;
  const [encodedIv, encodedPayload, extra] = token.split(".");
  if (!encodedIv || !encodedPayload || extra !== undefined) return null;

  try {
    const key = await getEncryptionKey(effectiveSecret);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64Url(encodedIv) }, key, decodeBase64Url(encodedPayload));
    const data: unknown = JSON.parse(new TextDecoder().decode(decrypted));
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readAdminSession(token: string | undefined, secret: string | undefined): Promise<AdminSession | null> {
  const effectiveSecret = secret || process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
  const data = await decryptPayload(token, effectiveSecret);
  if (!data || typeof data.userId !== "number" || data.userId < 1 ||
    typeof data.email !== "string" || !isAuthorizedAdminEmail(data.email) ||
    typeof data.exp !== "number" || data.exp <= Math.floor(Date.now() / 1000)) return null;
  return {
    userId: data.userId,
    email: data.email,
    exp: data.exp,
  };
}

export async function readAdminLoginChallenge(token: string | undefined, secret: string | undefined): Promise<AdminLoginChallenge | null> {
  const effectiveSecret = secret || process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
  const data = await decryptPayload(token, effectiveSecret);
  if (!data || typeof data.id !== "string" || !data.id ||
    typeof data.nonce !== "string" || !data.nonce ||
    typeof data.email !== "string" || !isAuthorizedAdminEmail(data.email) ||
    typeof data.otpDigest !== "string" || !/^[a-f0-9]{64}$/.test(data.otpDigest) ||
    typeof data.exp !== "number" || data.exp <= Math.floor(Date.now() / 1000)) return null;
  return {
    id: data.id,
    nonce: data.nonce,
    email: data.email,
    otpDigest: data.otpDigest,
    exp: data.exp,
  };
}

export async function verifyAdminSession(token: string | undefined, secret: string | undefined) {
  return (await readAdminSession(token, secret)) !== null;
}

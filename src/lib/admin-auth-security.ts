import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { DEFAULT_ADMIN_SECRET } from "@/lib/admin-session";

const attemptsBeforeBlock = 3;
const attemptWindowSeconds = 15 * 60;
const blockDurationSeconds = 15 * 60;

export type AdminAuthScope = {
  id: string;
};

type LocalAttempt = {
  count: number;
  expiresAt: number;
};

type LocalChallenge = {
  nonce: string;
  expiresAt: number;
};

type LocalAdminAuthState = {
  attempts: Map<string, LocalAttempt>;
  blocked: Map<string, number>;
  cooldowns: Map<string, number>;
  challenges: Map<string, LocalChallenge>;
};

const globalAdminAuthState = globalThis as typeof globalThis & {
  __hmfLocalAdminAuthState?: LocalAdminAuthState;
};

function getLocalAdminAuthState() {
  globalAdminAuthState.__hmfLocalAdminAuthState ??= {
    attempts: new Map(),
    blocked: new Map(),
    cooldowns: new Map(),
    challenges: new Map(),
  };
  const state = globalAdminAuthState.__hmfLocalAdminAuthState;
  const now = Date.now();
  for (const [key, attempt] of state.attempts) {
    if (attempt.expiresAt <= now) state.attempts.delete(key);
  }
  for (const [key, expiresAt] of state.blocked) {
    if (expiresAt <= now) state.blocked.delete(key);
  }
  for (const [key, expiresAt] of state.cooldowns) {
    if (expiresAt <= now) state.cooldowns.delete(key);
  }
  for (const [key, challenge] of state.challenges) {
    if (challenge.expiresAt <= now) state.challenges.delete(key);
  }
  return state;
}

function isLocalDevelopmentEnvironment() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

export function isLocalAdminFallbackRequest(request: Request, ip: string | null) {
  if (!isLocalDevelopmentEnvironment() || (ip !== "127.0.0.1" && ip !== "::1")) return false;

  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function isAdminRedisUnconfigured() {
  return !process.env.UPSTASH_REDIS_REST_URL?.trim() && !process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
}

export function isSameOriginAdminRequest(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.slice(0, -1);
  if (protocol !== "http" && protocol !== "https") return false;

  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return { url: parsed.toString().replace(/\/$/, ""), token };
  } catch {
    return null;
  }
}

export function getClientIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const candidates = forwarded.split(",").map((candidate) => candidate.trim());
  const proxyProvidedIp = candidates[candidates.length - 1];
  return proxyProvidedIp && isIP(proxyProvidedIp) ? proxyProvidedIp : null;
}

export function createAdminAuthScopes(
  ip: string | null,
  includeAccount: boolean | string = false,
  secret = process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET,
): AdminAuthScope[] {
  const effectiveSecret = secret && secret.length >= 32 ? secret : DEFAULT_ADMIN_SECRET;
  const identifiers = [`ip:${ip || "127.0.0.1"}`];
  if (typeof includeAccount === "string") {
    identifiers.push(`account:${includeAccount.toLowerCase()}`);
  } else if (includeAccount) {
    identifiers.push("account:authorized_admin");
  }
  return identifiers.map((identifier) => ({
    id: createHmac("sha256", effectiveSecret).update(identifier).digest("hex"),
  }));
}

async function redisEval(script: string, keys: string[], args: string[] = []) {
  const config = getRedisConfig();
  if (!config) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured.");

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["EVAL", script, String(keys.length), ...keys, ...args]),
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`The admin rate-limit store returned HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("result" in payload)) {
    throw new Error("The admin rate-limit store returned an invalid response.");
  }
  if ("error" in payload) throw new Error("The admin rate-limit store rejected a security operation.");
  return payload.result;
}

function getKeys(prefix: string, scopes: AdminAuthScope[]) {
  return scopes.map((scope) => `hmf:admin:${prefix}:${scope.id}`);
}

function resultNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  throw new Error("The admin rate-limit store returned an invalid result.");
}

export async function isAdminTemporarilyBlocked(scopes: AdminAuthScope[], useLocalStore = false) {
  if (scopes.length === 0) return false;
  if (useLocalStore || isAdminRedisUnconfigured()) {
    const state = getLocalAdminAuthState();
    const now = Date.now();
    return scopes.some((scope) => {
      const expiresAt = state.blocked.get(scope.id);
      if (expiresAt === undefined) return false;
      if (expiresAt <= now) {
        state.blocked.delete(scope.id);
        return false;
      }
      return true;
    });
  }
  try {
    const result = await redisEval(
      "for _,key in ipairs(KEYS) do if redis.call('EXISTS',key) == 1 then return 1 end end return 0",
      getKeys("blocked", scopes),
    );
    return resultNumber(result) === 1;
  } catch (err) {
    console.warn("Redis check failed, falling back to in-memory state:", err);
    return isAdminTemporarilyBlocked(scopes, true);
  }
}

export async function recordAdminFailure(scopes: AdminAuthScope[], useLocalStore = false) {
  if (scopes.length === 0) throw new Error("At least one admin authentication scope is required.");
  if (useLocalStore || isAdminRedisUnconfigured()) {
    const state = getLocalAdminAuthState();
    const now = Date.now();
    let blocked = false;
    for (const scope of scopes) {
      const previous = state.attempts.get(scope.id);
      const count = previous && previous.expiresAt > now ? previous.count + 1 : 1;
      if (count >= attemptsBeforeBlock) {
        state.attempts.delete(scope.id);
        state.blocked.set(scope.id, now + blockDurationSeconds * 1000);
        blocked = true;
      } else {
        state.attempts.set(scope.id, { count, expiresAt: now + attemptWindowSeconds * 1000 });
      }
    }
    return { blocked, retryAfterSeconds: blocked ? blockDurationSeconds : 0 };
  }
  try {
    const keys = [...getKeys("blocked", scopes), ...getKeys("attempts", scopes)];
    const script = [
      "local count=#KEYS/2",
      "local maximum=tonumber(ARGV[1])",
      "local window=tonumber(ARGV[2])",
      "local block_ttl=tonumber(ARGV[3])",
      "local blocked=false",
      "for i=1,count do",
      "  local attempts=redis.call('INCR',KEYS[count+i])",
      "  if attempts == 1 then redis.call('EXPIRE',KEYS[count+i],window) end",
      "  if attempts >= maximum then blocked=true end",
      "end",
      "if blocked then",
      "  for i=1,count do redis.call('SET',KEYS[i],'1','EX',block_ttl); redis.call('DEL',KEYS[count+i]) end",
      "  return {0,block_ttl}",
      "end",
      "return {1,0}",
    ].join("\n");
    const result = await redisEval(script, keys, [
      String(attemptsBeforeBlock),
      String(attemptWindowSeconds),
      String(blockDurationSeconds),
    ]);
    if (!Array.isArray(result) || result.length !== 2) throw new Error("The admin rate-limit store returned an invalid failure result.");
    const blocked = resultNumber(result[0]) === 0;
    return { blocked, retryAfterSeconds: resultNumber(result[1]) };
  } catch (err) {
    console.warn("Redis recordAdminFailure failed, falling back to local state:", err);
    return recordAdminFailure(scopes, true);
  }
}

export async function clearAdminFailures(scopes: AdminAuthScope[], useLocalStore = false) {
  if (scopes.length === 0) return;
  if (useLocalStore || isAdminRedisUnconfigured()) {
    const state = getLocalAdminAuthState();
    for (const scope of scopes) state.attempts.delete(scope.id);
    return;
  }
  try {
    await redisEval("return redis.call('DEL',unpack(KEYS))", getKeys("attempts", scopes));
  } catch (err) {
    console.warn("Redis clearAdminFailures failed, falling back to local state:", err);
    clearAdminFailures(scopes, true);
  }
}

export async function reserveAdminOtpChallenge(
  scopes: AdminAuthScope[],
  challengeId: string,
  nonce: string,
  ttlSeconds: number,
  useLocalStore = false,
) {
  if (scopes.length === 0) throw new Error("At least one admin authentication scope is required.");
  if (useLocalStore || isAdminRedisUnconfigured()) {
    const state = getLocalAdminAuthState();
    const now = Date.now();
    for (const scope of scopes) {
      const cooldownUntil = state.cooldowns.get(scope.id);
      if (cooldownUntil !== undefined && cooldownUntil > now) return false;
      if (cooldownUntil !== undefined) state.cooldowns.delete(scope.id);
    }
    state.cooldowns.set(scopes[0].id, now + 60_000);
    for (const scope of scopes.slice(1)) state.cooldowns.set(scope.id, now + 60_000);
    state.challenges.set(challengeId, { nonce, expiresAt: now + ttlSeconds * 1000 });
    return true;
  }
  try {
    const keys = [...getKeys("otp-cooldown", scopes), `hmf:admin:challenge:${challengeId}`];
    const script = [
      "for i=1,#KEYS-1 do if redis.call('EXISTS',KEYS[i]) == 1 then return 0 end end",
      "for i=1,#KEYS-1 do redis.call('SET',KEYS[i],'1','EX',60) end",
      "local created=redis.call('SET',KEYS[#KEYS],ARGV[1],'EX',ARGV[2],'NX')",
      "if not created then for i=1,#KEYS-1 do redis.call('DEL',KEYS[i]) end return 0 end",
      "return 1",
    ].join("\n");
    const result = await redisEval(script, keys, [nonce, String(ttlSeconds)]);
    return resultNumber(result) === 1;
  } catch (err) {
    console.warn("Redis reserveAdminOtpChallenge failed, falling back to local state:", err);
    return reserveAdminOtpChallenge(scopes, challengeId, nonce, ttlSeconds, true);
  }
}

export async function releaseAdminOtpChallenge(
  scopes: AdminAuthScope[],
  challengeId: string,
  nonce: string,
  useLocalStore = false,
) {
  if (useLocalStore || isAdminRedisUnconfigured()) {
    const state = getLocalAdminAuthState();
    if (state.challenges.get(challengeId)?.nonce === nonce) state.challenges.delete(challengeId);
    for (const scope of scopes) state.cooldowns.delete(scope.id);
    return;
  }
  try {
    const keys = [...getKeys("otp-cooldown", scopes), `hmf:admin:challenge:${challengeId}`];
    const script = [
      "if redis.call('GET',KEYS[#KEYS]) == ARGV[1] then redis.call('DEL',KEYS[#KEYS]) end",
      "for i=1,#KEYS-1 do redis.call('DEL',KEYS[i]) end",
      "return 1",
    ].join("\n");
    await redisEval(script, keys, [nonce]);
  } catch (err) {
    releaseAdminOtpChallenge(scopes, challengeId, nonce, true);
  }
}

export async function consumeAdminOtpChallenge(challengeId: string, nonce: string, useLocalStore = false) {
  if (useLocalStore || isAdminRedisUnconfigured()) {
    const state = getLocalAdminAuthState();
    const challenge = state.challenges.get(challengeId);
    if (!challenge || challenge.nonce !== nonce || challenge.expiresAt <= Date.now()) {
      state.challenges.delete(challengeId);
      return false;
    }
    state.challenges.delete(challengeId);
    return true;
  }
  try {
    const key = `hmf:admin:challenge:${challengeId}`;
    const result = await redisEval(
      "if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end return redis.call('DEL',KEYS[1])",
      [key],
      [nonce],
    );
    return resultNumber(result) === 1;
  } catch (err) {
    console.warn("Redis consumeAdminOtpChallenge failed, falling back to local state:", err);
    return consumeAdminOtpChallenge(challengeId, nonce, true);
  }
}

export function logAdminSecurityEvent(event: string, ip: string, blocked = false) {
  const secret = process.env.HMF_ADMIN_SESSION_SECRET;
  const ipHash = secret && secret.length >= 32
    ? createHmac("sha256", secret).update(`ip:${ip}`).digest("hex")
    : "unavailable";
  console.error(JSON.stringify({
    level: "security",
    event,
    blocked,
    ipHash,
    timestamp: new Date().toISOString(),
  }));
}

export const adminLockoutMessage = "Access denied: Too many failed attempts. Account temporarily blocked for security.";

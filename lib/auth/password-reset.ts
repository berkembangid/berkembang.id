import crypto from "crypto";

export const OTP_EXPIRY_MINUTES = 5;
export const MAX_VERIFY_ATTEMPTS = 5;

/**
 * Hash OTP code (SHA-256) agar tidak disimpan plain text di database
 */
export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

/**
 * Generate 6-digit cryptographically secure OTP string
 */
export function generateOtp(): string {
  // Angka acak antara 100000 dan 999999
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Generate temporary reset session token (random 32 bytes hex)
 */
export function generateResetSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

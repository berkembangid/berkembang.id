import { describe, it, expect } from "vitest";
import {
  generateOtp,
  hashOtp,
  generateResetSessionToken,
  OTP_EXPIRY_MINUTES,
  MAX_VERIFY_ATTEMPTS,
} from "@/lib/auth/password-reset";

describe("Password Reset Helpers", () => {
  it("should generate a 6-digit numeric OTP", () => {
    const otp = generateOtp();
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it("should hash OTP deterministically with SHA-256", () => {
    const otp = "123456";
    const hash1 = hashOtp(otp);
    const hash2 = hashOtp(otp);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it("should generate a secure random reset session token", () => {
    const token1 = generateResetSessionToken();
    const token2 = generateResetSessionToken();
    expect(token1).toHaveLength(64); // 32 bytes hex
    expect(token1).not.toBe(token2);
  });

  it("should have correct expiry and attempt configurations", () => {
    expect(OTP_EXPIRY_MINUTES).toBe(5);
    expect(MAX_VERIFY_ATTEMPTS).toBe(5);
  });
});

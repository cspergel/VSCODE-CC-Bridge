import { describe, it, expect, beforeEach } from "vitest";
import { AuthGuard } from "../auth.js";

describe("AuthGuard", () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = new AuthGuard({
      allowedNumbers: ["+1234567890", "+0987654321"],
      rateLimit: { maxPerHour: 30, burstMax: 5 },
    });
  });

  it("allows messages from allowlisted numbers", () => {
    expect(guard.isAllowed("+1234567890")).toBe(true);
  });

  it("rejects messages from non-allowlisted numbers", () => {
    expect(guard.isAllowed("+5555555555")).toBe(false);
  });

  it("enforces rate limiting", () => {
    for (let i = 0; i < 30; i++) {
      expect(guard.checkRateLimit("+1234567890")).toBe(true);
    }
    expect(guard.checkRateLimit("+1234567890")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { classify, Classification } from "../classifier";

describe("Activity Classifier", () => {
  describe("STATUS detection", () => {
    it("classifies 'Reading src/api/auth.ts...' as STATUS", () => {
      expect(classify("Reading src/api/auth.ts...")).toBe(Classification.Status);
    });
    it("classifies 'Analyzing authentication flow...' as STATUS", () => {
      expect(classify("Analyzing authentication flow...")).toBe(Classification.Status);
    });
    it("classifies 'Searching for files...' as STATUS", () => {
      expect(classify("Searching for files...")).toBe(Classification.Status);
    });
  });

  describe("DECISION detection", () => {
    it("classifies 'Should I proceed with all three fixes? (y/n)' as DECISION", () => {
      expect(classify("Should I proceed with all three fixes? (y/n)")).toBe(Classification.Decision);
    });
    it("classifies 'Run this command?' as DECISION", () => {
      expect(classify("Run this command?")).toBe(Classification.Decision);
    });
    it("classifies 'Would you like me to apply these changes?' as DECISION", () => {
      expect(classify("Would you like me to apply these changes?")).toBe(Classification.Decision);
    });
  });

  describe("ERROR detection", () => {
    it("classifies 'Error: ENOENT' as ERROR", () => {
      expect(classify("Error: ENOENT: no such file")).toBe(Classification.Error);
    });
    it("classifies 'TypeError: x is not a function' as ERROR", () => {
      expect(classify("TypeError: x is not a function")).toBe(Classification.Error);
    });
    it("classifies stack traces as ERROR", () => {
      expect(classify("    at Object.<anonymous> (/src/index.ts:5:1)")).toBe(Classification.Error);
    });
  });

  describe("OUTPUT detection", () => {
    it("classifies multi-line explanation as OUTPUT", () => {
      expect(classify("Found 3 issues:\n1. No token expiry\n2. Missing rotation")).toBe(Classification.Output);
    });
    it("classifies plain text result as OUTPUT", () => {
      expect(classify("The authentication module uses JWT tokens stored in httpOnly cookies.")).toBe(Classification.Output);
    });
  });
});

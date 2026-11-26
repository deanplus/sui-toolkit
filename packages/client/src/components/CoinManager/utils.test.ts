import { describe, expect, it } from "vitest";
import { SUI_TYPE_ARG } from "@mysten/sui/utils";
import { formatBalance, formatCoinId, formatCoinType } from "./utils";

describe("CoinManager utils", () => {
  describe("formatCoinType", () => {
    it("returns SUI for native SUI type", () => {
      expect(formatCoinType(SUI_TYPE_ARG)).toBe("SUI");
    });

    it("shortens structured coin types", () => {
      expect(formatCoinType("0x1234567890abcdef::usdc::USDC")).toBe(
        "0x12...cdef::USDC",
      );
    });

    it("returns short non-structured coin types as-is", () => {
      expect(formatCoinType("CUSTOM")).toBe("CUSTOM");
    });
  });

  describe("formatBalance", () => {
    it("formats zero balance", () => {
      expect(formatBalance("0", 9)).toBe("0");
    });

    it("formats integer and fractional balances without trailing zeros", () => {
      expect(formatBalance("1000000000", 9)).toBe("1");
      expect(formatBalance("1250000000", 9)).toBe("1.25");
      expect(formatBalance("500000", 6)).toBe("0.5");
    });

    it("falls back to 0 on invalid input", () => {
      expect(formatBalance("not-a-number", 9)).toBe("0");
    });
  });

  describe("formatCoinId", () => {
    it("keeps short IDs intact", () => {
      expect(formatCoinId("0x123456")).toBe("0x123456");
    });

    it("truncates long IDs", () => {
      expect(formatCoinId("0x1234567890abcdef")).toBe("0x12...cdef");
    });
  });
});

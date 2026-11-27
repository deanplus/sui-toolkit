import { describe, expect, it } from "vitest";
import {
  estimateDifficulty,
  formatDurationSeconds,
  matchesVanityAddress,
  normalizeHexAffix,
  validateVanityConfig,
} from "./vanityUtils";

describe("vanityUtils", () => {
  it("normalizes hex affix by trimming, lowercasing, and removing 0x", () => {
    expect(normalizeHexAffix(" 0xAbC ")).toBe("abc");
    expect(normalizeHexAffix("DEad")).toBe("dead");
    expect(normalizeHexAffix("")).toBe("");
  });

  it("validates vanity configs correctly", () => {
    expect(validateVanityConfig("", "")).toMatchObject({
      valid: false,
      error: "emptyPattern",
    });

    expect(validateVanityConfig("0xzz", "")).toMatchObject({
      valid: false,
      error: "invalidHex",
    });

    expect(validateVanityConfig("123456", "7890a")).toMatchObject({
      valid: false,
      error: "tooLong",
    });

    expect(validateVanityConfig("0x888", "aaa")).toMatchObject({
      valid: true,
      error: null,
      normalizedPrefix: "888",
      normalizedSuffix: "aaa",
      totalLength: 6,
      expectedAttempts: Math.pow(16, 6),
    });
  });

  it("matches sui addresses against prefix and suffix", () => {
    const addr =
      "0x8888a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef12345678beef";
    expect(matchesVanityAddress(addr, "8888", "beef")).toBe(true);
    expect(matchesVanityAddress(addr, "8888", "")).toBe(true);
    expect(matchesVanityAddress(addr, "", "beef")).toBe(true);
    expect(matchesVanityAddress(addr, "9999", "beef")).toBe(false);
    expect(matchesVanityAddress(addr, "8888", "cafe")).toBe(false);
  });

  it("estimates difficulty and formats durations", () => {
    expect(estimateDifficulty(3, 0)).toBe(4096);
    expect(estimateDifficulty(2, 2)).toBe(65536);
    expect(formatDurationSeconds(0.4)).toBe("< 1s");
    expect(formatDurationSeconds(45)).toBe("45s");
    expect(formatDurationSeconds(125)).toBe("2m 5s");
    expect(formatDurationSeconds(7260)).toBe("2h 1m");
    expect(formatDurationSeconds(172800)).toBe("2.0d");
  });
});

import { describe, expect, it } from "vitest";
import {
  formatCoinAmountWithDecimals,
  isValidCoinType,
  normalizeCoinTypeInput,
  parseRegulatedState,
  parseSupplyState,
} from "./coinInfoUtils";

describe("coinInfoUtils", () => {
  it("validates Sui coin types including generic struct tags", () => {
    expect(isValidCoinType("0x2::sui::SUI")).toBe(true);
    expect(
      isValidCoinType(
        "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      ),
    ).toBe(true);
    expect(isValidCoinType("0x1::lp::LP<0x2::sui::SUI>")).toBe(true);
    expect(
      isValidCoinType(
        "0x1::lp::LP<0x2::sui::SUI, 0x2::coin::Coin<0x2::sui::SUI>>",
      ),
    ).toBe(true);
    expect(isValidCoinType("  0x2::sui::SUI  ")).toBe(true);
    expect(isValidCoinType("0x2::sui")).toBe(false);
    expect(isValidCoinType("sui::SUI")).toBe(false);
    expect(isValidCoinType("")).toBe(false);
  });

  it("normalizes whitespace around coin type", () => {
    expect(normalizeCoinTypeInput("  0x2::sui::SUI \n")).toBe("0x2::sui::SUI");
  });

  it("formats large bigint supply accurately with decimals including >18", () => {
    // 10,000,000,000 SUI in MIST (9 decimals)
    expect(
      formatCoinAmountWithDecimals(BigInt("10000000000000000000"), 9),
    ).toBe("10,000,000,000");
    // 19 decimals should not be clamped to 18
    expect(
      formatCoinAmountWithDecimals(BigInt("10000000000000000000"), 19),
    ).toBe("1");
    expect(formatCoinAmountWithDecimals("1234567890", 6)).toBe("1,234.56789");
    expect(formatCoinAmountWithDecimals("1000", 0)).toBe("1,000");
    expect(formatCoinAmountWithDecimals("0", 9)).toBe("0");
    expect(() => formatCoinAmountWithDecimals("100", -1)).toThrow(RangeError);
    expect(() => formatCoinAmountWithDecimals("100", 256)).toThrow(RangeError);
  });

  it("maps supply state and regulated state enums", () => {
    expect(parseSupplyState(1)).toBe("fixed");
    expect(parseSupplyState(2)).toBe("burnOnly");
    expect(parseSupplyState(0)).toBe("mutable");
    expect(parseSupplyState(undefined)).toBe("mutable");

    expect(parseRegulatedState(1, false)).toBe("regulated");
    expect(parseRegulatedState(0, true)).toBe("regulated");
    expect(parseRegulatedState(2, false)).toBe("unregulated");
    expect(parseRegulatedState(undefined, false)).toBe("unknown");
  });
});

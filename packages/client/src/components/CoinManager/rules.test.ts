import { describe, expect, it } from "vitest";
import { SUI_TYPE_ARG } from "../../utils/constants";
import {
  capMergeCoinIds,
  getBurnableCoinIds,
  getDefaultBurnSelectedIds,
  getMergeableCoinIds,
  getReservedGasSuiCoinId,
  getZeroBalanceCoinIds,
  isCoinBurnable,
  isZeroBalance,
  resolveMergePlan,
  sortCoinsByBalanceDesc,
  validateBurnSelection,
} from "./rules";
import { CoinObject } from "./types";

const makeCoin = (
  id: string,
  balance: string,
  type: string = SUI_TYPE_ARG,
): CoinObject => ({
  id,
  balance,
  type,
  decimals: 9,
});

describe("CoinManager business rules", () => {
  it("handles zero balance and large bigint balance sorting safely", () => {
    expect(isZeroBalance("0")).toBe(true);
    expect(isZeroBalance("1")).toBe(false);
    expect(isZeroBalance("invalid")).toBe(false);

    const coins = [
      makeCoin("c1", "100000000000000000001"),
      makeCoin("c2", "100000000000000000003"),
      makeCoin("c3", "100000000000000000002"),
    ];
    expect(sortCoinsByBalanceDesc(coins).map((c) => c.id)).toEqual([
      "c2",
      "c3",
      "c1",
    ]);
  });

  it("reserves highest-balance SUI coin for gas and enforces merge thresholds", () => {
    const twoSui = [makeCoin("s1", "500"), makeCoin("s2", "1000")];
    expect(getReservedGasSuiCoinId(twoSui, SUI_TYPE_ARG)).toBe("s2");
    expect(getMergeableCoinIds(twoSui, SUI_TYPE_ARG)).toEqual([]);

    const threeSui = [...twoSui, makeCoin("s3", "100")];
    expect(getMergeableCoinIds(threeSui, SUI_TYPE_ARG)).toEqual(["s1", "s3"]);

    const twoUsdc = [
      makeCoin("u1", "100", "0x2::usdc::USDC"),
      makeCoin("u2", "200", "0x2::usdc::USDC"),
    ];
    expect(getReservedGasSuiCoinId(twoUsdc, "0x2::usdc::USDC")).toBeNull();
    expect(getMergeableCoinIds(twoUsdc, "0x2::usdc::USDC")).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("caps merge selection at limit and excludes reserved SUI gas coin", () => {
    const ids = Array.from({ length: 520 }, (_, i) => `c${i}`);
    const capped = capMergeCoinIds(ids, 512);
    expect(capped.wasCapped).toBe(true);
    expect(capped.coinIds).toHaveLength(512);

    const suiCoins = [
      makeCoin("gas", "9000"),
      makeCoin("a", "100"),
      makeCoin("b", "200"),
    ];
    const plan = resolveMergePlan(suiCoins, ["gas", "a", "b"], SUI_TYPE_ARG);
    expect(plan).toEqual({
      primaryCoinId: "a",
      otherCoinIds: ["b"],
      gasCoinId: "gas",
      wasCapped: false,
    });

    // Only gas + 1 coin selected -> not enough to merge
    expect(resolveMergePlan(suiCoins, ["gas", "a"], SUI_TYPE_ARG)).toBeNull();
  });

  it("filters zero-balance coins", () => {
    const coins = [
      makeCoin("z1", "0"),
      makeCoin("n1", "10"),
      makeCoin("z2", "0"),
    ];
    expect(getZeroBalanceCoinIds(coins)).toEqual(["z1", "z2"]);
  });

  it("prevents burning SUI when fewer than 2 SUI objects exist and always protects gas SUI", () => {
    const singleSui = [makeCoin("only-sui", "1000")];
    expect(isCoinBurnable(singleSui[0], singleSui, SUI_TYPE_ARG)).toBe(false);
    expect(getBurnableCoinIds(singleSui, SUI_TYPE_ARG)).toEqual([]);
    expect(
      getDefaultBurnSelectedIds(singleSui, SUI_TYPE_ARG, 9, "1.0"),
    ).toEqual([]);

    const twoSui = [
      makeCoin("gas-sui", "50000000"), // 0.05 SUI (< $0.1 even at $1, still must be kept!)
      makeCoin("dust-sui", "1000"),
    ];
    expect(getBurnableCoinIds(twoSui, SUI_TYPE_ARG)).toEqual(["dust-sui"]);
    expect(getDefaultBurnSelectedIds(twoSui, SUI_TYPE_ARG, 9, "1.0")).toEqual([
      "dust-sui",
    ]);
  });

  it("validates burn selection against burning the last SUI object", () => {
    const singleSuiSummary = [
      { type: SUI_TYPE_ARG, objects: [makeCoin("only-sui", "1000")] },
    ];
    expect(validateBurnSelection([], singleSuiSummary)).toEqual({
      valid: false,
      reason: "empty",
    });
    expect(validateBurnSelection(["only-sui"], singleSuiSummary)).toEqual({
      valid: false,
      reason: "cannotBurnLastSui",
    });

    const twoSuiSummary = [
      {
        type: SUI_TYPE_ARG,
        objects: [makeCoin("s1", "1000"), makeCoin("s2", "5000")],
      },
      {
        type: "0x2::meme::MEME",
        objects: [makeCoin("m1", "10", "0x2::meme::MEME")],
      },
    ];
    // Burning all SUI objects is rejected
    expect(validateBurnSelection(["s1", "s2"], twoSuiSummary)).toEqual({
      valid: false,
      reason: "cannotBurnLastSui",
    });
    // Burning 1 of 2 SUI objects + non-SUI is allowed
    expect(validateBurnSelection(["s1", "m1"], twoSuiSummary)).toEqual({
      valid: true,
    });
  });
});

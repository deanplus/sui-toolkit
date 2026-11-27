import { isValidStructTag } from "@mysten/sui/utils";
import { SUI_TYPE_ARG } from "../../utils/constants";

export interface CoinPreset {
  label: string;
  coinType: string;
  mainnetOnly?: boolean;
}

export const POPULAR_COIN_PRESETS: CoinPreset[] = [
  {
    label: "SUI",
    coinType: SUI_TYPE_ARG,
  },
  {
    label: "USDC",
    coinType:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    mainnetOnly: true,
  },
  {
    label: "DEEP",
    coinType:
      "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    mainnetOnly: true,
  },
  {
    label: "WAL",
    coinType:
      "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    mainnetOnly: true,
  },
  {
    label: "NS",
    coinType:
      "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
    mainnetOnly: true,
  },
];

export function normalizeCoinTypeInput(input: string): string {
  return input.trim();
}

export function isValidCoinType(input: string): boolean {
  const normalized = normalizeCoinTypeInput(input);
  if (!normalized) return false;
  return isValidStructTag(normalized);
}

/**
 * Format a bigint or numeric string amount with decimals and thousand separators,
 * preserving full BigInt precision for any valid Sui u8 decimals (0..255).
 */
export function formatCoinAmountWithDecimals(
  rawAmount: bigint | string | number,
  decimals: number,
  maxFractionDigits = 6,
): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError(`Invalid coin decimals: ${decimals}`);
  }

  const amount =
    typeof rawAmount === "bigint"
      ? rawAmount
      : BigInt(String(rawAmount).trim() || "0");
  const isNegative = amount < BigInt(0);
  const absAmount = isNegative ? -amount : amount;

  if (decimals === 0) {
    return `${isNegative ? "-" : ""}${addThousandSeparators(absAmount.toString())}`;
  }

  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = absAmount / divisor;
  const fraction = absAmount % divisor;
  const formattedWhole = addThousandSeparators(whole.toString());

  if (fraction === BigInt(0)) {
    return `${isNegative ? "-" : ""}${formattedWhole}`;
  }

  const paddedFraction = fraction.toString().padStart(decimals, "0");
  const displayDigits = Math.min(decimals, Math.max(0, maxFractionDigits));
  const trimmedFraction = paddedFraction
    .slice(0, displayDigits)
    .replace(/0+$/, "");

  if (!trimmedFraction) {
    return `${isNegative ? "-" : ""}${formattedWhole}`;
  }

  return `${isNegative ? "-" : ""}${formattedWhole}.${trimmedFraction}`;
}

function addThousandSeparators(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export type SupplyStateLabel = "fixed" | "burnOnly" | "mutable";

/**
 * Map Sui gRPC CoinTreasury.SupplyState enum value to a UI state key.
 * 0 = UNKNOWN (TreasuryCap exists / mintable), 1 = FIXED, 2 = BURN_ONLY
 */
export function parseSupplyState(
  supplyState?: number | null,
): SupplyStateLabel {
  if (supplyState === 1) return "fixed";
  if (supplyState === 2) return "burnOnly";
  return "mutable";
}

export type RegulatedStateLabel = "regulated" | "unregulated" | "unknown";

/**
 * Map Sui gRPC RegulatedCoinMetadata.coinRegulatedState enum value to a UI state key.
 * 0 = UNKNOWN, 1 = REGULATED, 2 = UNREGULATED
 */
export function parseRegulatedState(
  regulatedState?: number | null,
  hasDenyCap?: boolean,
): RegulatedStateLabel {
  if (regulatedState === 1 || hasDenyCap) return "regulated";
  if (regulatedState === 2) return "unregulated";
  return "unknown";
}

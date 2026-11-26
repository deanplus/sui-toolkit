import { MAX_MERGE_COIN_OBJECTS, SUI_TYPE_ARG } from "../../utils/constants";
import { calculateValue } from "../../utils/priceUtils";
import { CoinObject, CoinTypeSummary } from "./types";

export const LOW_VALUE_THRESHOLD_USD = 0.1;

export interface BurnableCoinObject extends CoinObject {
  symbol?: string;
  value?: number | null;
  price?: string | null;
  iconUrl?: string | null;
}

export const isSuiCoinType = (coinType: string): boolean => {
  return coinType === SUI_TYPE_ARG || coinType.includes("sui::SUI");
};

export const isZeroBalance = (balance: string): boolean => {
  try {
    return BigInt(balance) === 0n;
  } catch {
    return false;
  }
};

export const sortCoinsByBalanceDesc = <T extends Pick<CoinObject, "balance">>(
  coins: T[],
): T[] => {
  return [...coins].sort((a, b) => {
    const diff = BigInt(b.balance) - BigInt(a.balance);
    if (diff > 0n) return 1;
    if (diff < 0n) return -1;
    return 0;
  });
};

export const getReservedGasSuiCoinId = (
  coins: Pick<CoinObject, "id" | "balance">[],
  coinType: string,
): string | null => {
  if (!isSuiCoinType(coinType) || coins.length === 0) {
    return null;
  }
  return sortCoinsByBalanceDesc(coins)[0].id;
};

export const getZeroBalanceCoinIds = (
  coins: Pick<CoinObject, "id" | "balance">[],
): string[] => {
  return coins
    .filter((coin) => isZeroBalance(coin.balance))
    .map((coin) => coin.id);
};

export const getMergeableCoinIds = (
  coins: Pick<CoinObject, "id" | "balance">[],
  coinType: string,
): string[] => {
  if (isSuiCoinType(coinType)) {
    // SUI requires at least 3 objects: 1 reserved for gas + at least 2 to merge
    if (coins.length < 3) {
      return [];
    }
    const sorted = sortCoinsByBalanceDesc(coins);
    return sorted.slice(1).map((coin) => coin.id);
  }

  if (coins.length < 2) {
    return [];
  }

  return coins.map((coin) => coin.id);
};

export const capMergeCoinIds = (
  coinIds: string[],
  limit: number = MAX_MERGE_COIN_OBJECTS,
): { coinIds: string[]; wasCapped: boolean } => {
  if (coinIds.length <= limit) {
    return { coinIds, wasCapped: false };
  }
  return { coinIds: coinIds.slice(0, limit), wasCapped: true };
};

export const resolveMergePlan = (
  allCoinsOfType: Pick<CoinObject, "id" | "balance">[],
  selectedCoinIds: string[],
  coinType: string,
  limit: number = MAX_MERGE_COIN_OBJECTS,
): {
  primaryCoinId: string;
  otherCoinIds: string[];
  gasCoinId: string | null;
  wasCapped: boolean;
} | null => {
  const gasCoinId = getReservedGasSuiCoinId(allCoinsOfType, coinType);
  const filteredIds = gasCoinId
    ? selectedCoinIds.filter((id) => id !== gasCoinId)
    : selectedCoinIds;

  const { coinIds, wasCapped } = capMergeCoinIds(filteredIds, limit);
  if (coinIds.length < 2) {
    return null;
  }

  return {
    primaryCoinId: coinIds[0],
    otherCoinIds: coinIds.slice(1),
    gasCoinId,
    wasCapped,
  };
};

export const isCoinBurnable = (
  coin: Pick<CoinObject, "id" | "balance">,
  allCoinsOfType: Pick<CoinObject, "id" | "balance">[],
  coinType: string,
): boolean => {
  if (isSuiCoinType(coinType)) {
    // Burning SUI requires at least 2 SUI objects so the highest-balance one stays for gas
    if (allCoinsOfType.length < 2) {
      return false;
    }
    const reservedGasId = getReservedGasSuiCoinId(allCoinsOfType, coinType);
    return coin.id !== reservedGasId;
  }

  return true;
};

export const getBurnableCoinIds = (
  coins: Pick<CoinObject, "id" | "balance">[],
  coinType: string,
): string[] => {
  return coins
    .filter((coin) => isCoinBurnable(coin, coins, coinType))
    .map((coin) => coin.id);
};

export const isLowValueOrNoPriceCoin = (
  coin: Pick<CoinObject, "balance"> & {
    decimals?: number;
    price?: string | null;
  },
  fallbackDecimals: number,
  fallbackPrice?: string | null,
): boolean => {
  if (isZeroBalance(coin.balance)) {
    return true;
  }

  const effectivePrice = coin.price ?? fallbackPrice ?? null;
  if (!effectivePrice) {
    return true;
  }

  const effectiveDecimals = coin.decimals ?? fallbackDecimals;
  const value = calculateValue(coin.balance, effectivePrice, effectiveDecimals);
  return value < LOW_VALUE_THRESHOLD_USD;
};

export const getDefaultBurnSelectedIds = (
  coins: BurnableCoinObject[],
  coinType: string,
  fallbackDecimals: number,
  fallbackPrice?: string | null,
): string[] => {
  return coins
    .filter(
      (coin) =>
        isCoinBurnable(coin, coins, coinType) &&
        isLowValueOrNoPriceCoin(coin, fallbackDecimals, fallbackPrice),
    )
    .map((coin) => coin.id);
};

export const validateBurnSelection = (
  selectedCoinIds: string[],
  coinTypeSummaries: Pick<CoinTypeSummary, "type" | "objects">[],
): {
  valid: boolean;
  reason?: "empty" | "cannotBurnLastSui";
} => {
  if (selectedCoinIds.length === 0) {
    return { valid: false, reason: "empty" };
  }

  const suiSummary = coinTypeSummaries.find((summary) =>
    isSuiCoinType(summary.type),
  );
  if (!suiSummary) {
    return { valid: true };
  }

  const suiObjectIds = new Set(suiSummary.objects.map((coin) => coin.id));
  const selectedSuiIds = selectedCoinIds.filter((id) => suiObjectIds.has(id));

  if (selectedSuiIds.length === 0) {
    return { valid: true };
  }

  // Must keep at least 1 SUI object (and specifically cannot burn when only 1 SUI exists or all SUI are selected)
  if (
    suiSummary.objects.length < 2 ||
    selectedSuiIds.length >= suiSummary.objects.length
  ) {
    return { valid: false, reason: "cannotBurnLastSui" };
  }

  return { valid: true };
};

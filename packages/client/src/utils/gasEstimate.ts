import { Transaction } from "@mysten/sui/transactions";

export interface RawGasCostSummary {
  computationCost: string | number | bigint;
  storageCost: string | number | bigint;
  storageRebate: string | number | bigint;
  nonRefundableStorageFee?: string | number | bigint;
}

export interface GasEstimateSummary {
  computationCostMist: bigint;
  storageCostMist: bigint;
  storageRebateMist: bigint;
  nonRefundableStorageFeeMist: bigint;
  netGasMist: bigint;
}

export interface GasEstimateResult {
  success: boolean;
  summary: GasEstimateSummary | null;
  error?: string;
}

interface SimulationEffectsLike {
  gasUsed?: RawGasCostSummary;
  status?: {
    success?: boolean;
    error?: {
      message?: string;
      $kind?: string;
    } | null;
  };
}

interface SimulateTransactionResponseLike {
  $kind?: "Transaction" | "FailedTransaction";
  Transaction?: {
    effects?: SimulationEffectsLike;
  };
  FailedTransaction?: {
    effects?: SimulationEffectsLike;
  };
}

export interface SimulatableSuiClient {
  simulateTransaction: (options: {
    transaction: Transaction;
    include?: { effects?: boolean };
    doGasSelection?: boolean;
  }) => Promise<unknown>;
}

const MIST_PER_SUI = BigInt(1_000_000_000);

function toBigIntSafe(value: string | number | bigint | undefined): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "") {
    return BigInt(value);
  }
  return BigInt(0);
}

/**
 * Compute gas summary in MIST from simulation gasUsed fields.
 * netGasMist = computationCost + storageCost - storageRebate (can be negative when rebate exceeds cost).
 */
export function calculateGasSummary(
  gasUsed: RawGasCostSummary,
): GasEstimateSummary {
  const computationCostMist = toBigIntSafe(gasUsed.computationCost);
  const storageCostMist = toBigIntSafe(gasUsed.storageCost);
  const storageRebateMist = toBigIntSafe(gasUsed.storageRebate);
  const nonRefundableStorageFeeMist = toBigIntSafe(
    gasUsed.nonRefundableStorageFee,
  );
  const netGasMist = computationCostMist + storageCostMist - storageRebateMist;

  return {
    computationCostMist,
    storageCostMist,
    storageRebateMist,
    nonRefundableStorageFeeMist,
    netGasMist,
  };
}

/**
 * Format MIST bigint into a readable SUI string without losing precision.
 */
export function formatMistToSui(mist: bigint, maxFractionDigits = 6): string {
  const isNegative = mist < BigInt(0);
  const absMist = isNegative ? -mist : mist;
  const whole = absMist / MIST_PER_SUI;
  const fraction = absMist % MIST_PER_SUI;

  if (fraction === BigInt(0)) {
    return `${isNegative ? "-" : ""}${whole.toString()}`;
  }

  const paddedFraction = fraction.toString().padStart(9, "0");
  const trimmed = paddedFraction
    .slice(0, Math.max(0, Math.min(9, maxFractionDigits)))
    .replace(/0+$/, "");

  if (!trimmed) {
    if (whole === BigInt(0)) {
      return isNegative ? "> -0.000001" : "< 0.000001";
    }
    return `${isNegative ? "-" : ""}${whole.toString()}`;
  }

  return `${isNegative ? "-" : ""}${whole.toString()}.${trimmed}`;
}

/**
 * Simulate a Sui Transaction via gRPC/Core client and extract gas estimate or error.
 */
export async function simulateTransactionGas(
  client: SimulatableSuiClient,
  transaction: Transaction,
  sender: string,
): Promise<GasEstimateResult> {
  try {
    transaction.setSenderIfNotSet(sender);
    const response = (await client.simulateTransaction({
      transaction,
      include: { effects: true },
      doGasSelection: true,
    })) as SimulateTransactionResponseLike;

    if (response.$kind === "FailedTransaction") {
      const effects = response.FailedTransaction?.effects;
      const summary = effects?.gasUsed
        ? calculateGasSummary(effects.gasUsed)
        : null;
      const errorMessage =
        effects?.status?.error?.message ||
        effects?.status?.error?.$kind ||
        "Transaction simulation failed";
      return {
        success: false,
        summary,
        error: errorMessage,
      };
    }

    const effects = response.Transaction?.effects;
    if (effects?.status && effects.status.success === false) {
      return {
        success: false,
        summary: effects.gasUsed ? calculateGasSummary(effects.gasUsed) : null,
        error:
          effects.status.error?.message ||
          effects.status.error?.$kind ||
          "Transaction simulation failed",
      };
    }

    if (!effects?.gasUsed) {
      return {
        success: false,
        summary: null,
        error: "Gas usage data unavailable from simulation",
      };
    }

    return {
      success: true,
      summary: calculateGasSummary(effects.gasUsed),
    };
  } catch (error) {
    return {
      success: false,
      summary: null,
      error:
        error instanceof Error
          ? error.message
          : "Transaction simulation failed",
    };
  }
}

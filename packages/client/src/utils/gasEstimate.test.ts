import { describe, expect, it, vi } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import {
  calculateGasSummary,
  formatMistToSui,
  simulateTransactionGas,
} from "./gasEstimate";

describe("gasEstimate", () => {
  it("calculates positive net gas cost", () => {
    const summary = calculateGasSummary({
      computationCost: "1000000",
      storageCost: "2500000",
      storageRebate: "1500000",
      nonRefundableStorageFee: "15000",
    });

    expect(summary.computationCostMist).toBe(BigInt(1_000_000));
    expect(summary.storageCostMist).toBe(BigInt(2_500_000));
    expect(summary.storageRebateMist).toBe(BigInt(1_500_000));
    expect(summary.netGasMist).toBe(BigInt(2_000_000));
  });

  it("calculates negative net gas cost when rebate exceeds cost", () => {
    const summary = calculateGasSummary({
      computationCost: "1000000",
      storageCost: "988000",
      storageRebate: "4500000",
    });

    expect(summary.netGasMist).toBe(BigInt(-2_512_000));
  });

  it("formats MIST to SUI accurately", () => {
    expect(formatMistToSui(BigInt(0))).toBe("0");
    expect(formatMistToSui(BigInt(1_000_000_000))).toBe("1");
    expect(formatMistToSui(BigInt(2_500_000))).toBe("0.0025");
    expect(formatMistToSui(BigInt(-2_512_000))).toBe("-0.002512");
    expect(formatMistToSui(BigInt(500))).toBe("< 0.000001");
  });

  it("returns gas summary on successful simulation", async () => {
    const tx = new Transaction();
    const mockClient = {
      simulateTransaction: vi.fn().mockResolvedValue({
        $kind: "Transaction",
        Transaction: {
          effects: {
            status: { success: true, error: null },
            gasUsed: {
              computationCost: "1000000",
              storageCost: "1976000",
              storageRebate: "978120",
              nonRefundableStorageFee: "9880",
            },
          },
        },
      }),
    };

    const result = await simulateTransactionGas(mockClient, tx, "0x1");
    expect(result.success).toBe(true);
    expect(result.summary?.netGasMist).toBe(BigInt(1_997_880));
    expect(mockClient.simulateTransaction).toHaveBeenCalledWith({
      transaction: tx,
      include: { effects: true },
      doGasSelection: true,
    });
  });

  it("returns error details on failed simulation", async () => {
    const tx = new Transaction();
    const mockClient = {
      simulateTransaction: vi.fn().mockResolvedValue({
        $kind: "FailedTransaction",
        FailedTransaction: {
          effects: {
            status: {
              success: false,
              error: { message: "InsufficientCoinBalance" },
            },
            gasUsed: {
              computationCost: "1000000",
              storageCost: "0",
              storageRebate: "0",
            },
          },
        },
      }),
    };

    const result = await simulateTransactionGas(mockClient, tx, "0x1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("InsufficientCoinBalance");
    expect(result.summary?.netGasMist).toBe(BigInt(1_000_000));
  });
});

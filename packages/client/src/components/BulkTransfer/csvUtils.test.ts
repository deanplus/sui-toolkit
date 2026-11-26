import { describe, expect, it } from "vitest";
import { generateTransferCsvTemplate, parseTransferCsv } from "./csvUtils";

const VALID_ADDR_1 =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const VALID_ADDR_2 =
  "0x0000000000000000000000000000000000000000000000000000000000000002";

describe("BulkTransfer csvUtils", () => {
  it("parses standard CSV with header and validates addresses", () => {
    const csv = [
      "address,amount",
      `${VALID_ADDR_1}, 1.5`,
      `"${VALID_ADDR_2}", "2.25"`,
      "invalid_addr, 0.5",
    ].join("\r\n");

    const result = parseTransferCsv(csv);
    expect(result.skippedInvalidLines).toBe(0);
    expect(result.items).toEqual([
      { address: VALID_ADDR_1, amount: "1.5", isValidAddress: true },
      { address: VALID_ADDR_2, amount: "2.25", isValidAddress: true },
      { address: "invalid_addr", amount: "0.5", isValidAddress: false },
    ]);
  });

  it("supports Chinese header, BOM, tab separation, and skips malformed lines", () => {
    const csv = `\uFEFF地址\t数量\n${VALID_ADDR_1}\t-3\nbadline\n${VALID_ADDR_2},abc`;
    const result = parseTransferCsv(csv);
    expect(result.items).toEqual([
      { address: VALID_ADDR_1, amount: "3", isValidAddress: true },
    ]);
    expect(result.skippedInvalidLines).toBe(2);
  });

  it("generates a parseable CSV template", () => {
    const template = generateTransferCsvTemplate();
    const parsed = parseTransferCsv(template);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.isValidAddress)).toBe(true);
  });
});

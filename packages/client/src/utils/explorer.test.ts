import { describe, expect, it } from "vitest";
import {
  getExplorerTxUrl,
  getExplorerUrl,
  getSuiExplorerTxUrl,
  getSuiExplorerUrl,
  getSuiscanTxUrl,
  getSuiscanUrl,
  getSuivisionTxUrl,
  getSuivisionUrl,
} from "./explorer";

describe("explorer utils", () => {
  const address = "0x1234";
  const digest = "digest123";

  it("builds Suivision URLs and uses them as default", () => {
    expect(getSuivisionUrl(address, "testnet")).toBe(
      "https://testnet.suivision.xyz/account/0x1234",
    );
    expect(getSuivisionTxUrl(digest, "devnet")).toBe(
      "https://devnet.suivision.xyz/txblock/digest123",
    );
    expect(getExplorerUrl(address)).toBe(
      "https://mainnet.suivision.xyz/account/0x1234",
    );
    expect(getExplorerTxUrl(digest)).toBe(
      "https://mainnet.suivision.xyz/txblock/digest123",
    );
  });

  it("builds Suiscan and Sui Explorer URLs", () => {
    expect(getSuiscanUrl(address, "mainnet")).toBe(
      "https://suiscan.xyz/mainnet/account/0x1234",
    );
    expect(getSuiscanTxUrl(digest, "testnet")).toBe(
      "https://suiscan.xyz/testnet/tx/digest123",
    );
    expect(getSuiExplorerUrl(address, "devnet")).toBe(
      "https://explorer.sui.io/address/0x1234?network=devnet",
    );
    expect(getSuiExplorerTxUrl(digest, "mainnet")).toBe(
      "https://explorer.sui.io/txblock/digest123?network=mainnet",
    );
  });
});

import { isValidSuiAddress } from "@mysten/sui/utils";

export interface ParsedTransferItem {
  address: string;
  amount: string;
  isValidAddress: boolean;
}

export interface CsvParseResult {
  items: ParsedTransferItem[];
  skippedInvalidLines: number;
}

const isHeaderLine = (addressCol: string, amountCol: string): boolean => {
  const normalizedAddr = addressCol.toLowerCase();
  const normalizedAmount = amountCol.toLowerCase();
  return (
    normalizedAddr === "address" ||
    normalizedAddr === "地址" ||
    normalizedAddr === "recipient" ||
    normalizedAmount === "amount" ||
    normalizedAmount === "数量"
  );
};

export const parseTransferCsv = (content: string): CsvParseResult => {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const items: ParsedTransferItem[] = [];
  let skippedInvalidLines = 0;

  lines.forEach((line, index) => {
    const parts = line
      .split(/[,\t]/)
      .map((part) => part.trim().replace(/^["']|["']$/g, ""));

    if (parts.length < 2) {
      skippedInvalidLines++;
      return;
    }

    const [rawAddress, rawAmount] = parts;

    if (index === 0 && isHeaderLine(rawAddress, rawAmount)) {
      return;
    }

    const cleanAmount = rawAmount.replace(/^-+/, "");
    const numericAmount = Number(cleanAmount);

    if (!rawAddress || !cleanAmount || Number.isNaN(numericAmount)) {
      skippedInvalidLines++;
      return;
    }

    items.push({
      address: rawAddress,
      amount: cleanAmount,
      isValidAddress: isValidSuiAddress(rawAddress),
    });
  });

  return { items, skippedInvalidLines };
};

export const generateTransferCsvTemplate = (): string => {
  return [
    "address,amount",
    "0x0000000000000000000000000000000000000000000000000000000000000001,0.1",
    "0x0000000000000000000000000000000000000000000000000000000000000002,0.5",
  ].join("\n");
};

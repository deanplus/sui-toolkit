export const MAX_VANITY_TOTAL_LENGTH = 10;

const HEX_PATTERN = /^[0-9a-f]*$/;

export type VanityValidationError =
  "emptyPattern" | "invalidHex" | "tooLong" | null;

export interface VanityConfigValidation {
  valid: boolean;
  error: VanityValidationError;
  normalizedPrefix: string;
  normalizedSuffix: string;
  totalLength: number;
  expectedAttempts: number;
}

export function normalizeHexAffix(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
}

export function estimateDifficulty(
  prefixLength: number,
  suffixLength: number,
): number {
  const total = Math.max(0, prefixLength) + Math.max(0, suffixLength);
  if (total === 0) return 0;
  return Math.pow(16, total);
}

export function validateVanityConfig(
  prefix: string,
  suffix: string,
): VanityConfigValidation {
  const normalizedPrefix = normalizeHexAffix(prefix);
  const normalizedSuffix = normalizeHexAffix(suffix);
  const totalLength = normalizedPrefix.length + normalizedSuffix.length;

  if (totalLength === 0) {
    return {
      valid: false,
      error: "emptyPattern",
      normalizedPrefix,
      normalizedSuffix,
      totalLength: 0,
      expectedAttempts: 0,
    };
  }

  if (
    !HEX_PATTERN.test(normalizedPrefix) ||
    !HEX_PATTERN.test(normalizedSuffix)
  ) {
    return {
      valid: false,
      error: "invalidHex",
      normalizedPrefix,
      normalizedSuffix,
      totalLength,
      expectedAttempts: 0,
    };
  }

  if (totalLength > MAX_VANITY_TOTAL_LENGTH) {
    return {
      valid: false,
      error: "tooLong",
      normalizedPrefix,
      normalizedSuffix,
      totalLength,
      expectedAttempts: estimateDifficulty(
        normalizedPrefix.length,
        normalizedSuffix.length,
      ),
    };
  }

  return {
    valid: true,
    error: null,
    normalizedPrefix,
    normalizedSuffix,
    totalLength,
    expectedAttempts: estimateDifficulty(
      normalizedPrefix.length,
      normalizedSuffix.length,
    ),
  };
}

export function matchesVanityAddress(
  address: string,
  normalizedPrefix: string,
  normalizedSuffix: string,
): boolean {
  const body = address.toLowerCase().replace(/^0x/, "");
  if (normalizedPrefix && !body.startsWith(normalizedPrefix)) {
    return false;
  }
  if (normalizedSuffix && !body.endsWith(normalizedSuffix)) {
    return false;
  }
  return true;
}

export function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "< 1s";
  }
  if (seconds < 1) {
    return "< 1s";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  const days = (seconds / 86400).toFixed(1);
  return `${days}d`;
}

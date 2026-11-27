import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Icon,
  Input,
  Link,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { useTranslation } from "react-i18next";
import { FiCopy, FiExternalLink, FiSearch } from "react-icons/fi";
import toast from "react-hot-toast";
import { SUI_TYPE_ARG } from "../../utils/constants";
import { getExplorerCoinUrl, getExplorerObjectUrl } from "../../utils/explorer";
import { useWalletNetwork } from "../CustomConnectButton";
import {
  formatCoinAmountWithDecimals,
  isValidCoinType,
  normalizeCoinTypeInput,
  parseRegulatedState,
  parseSupplyState,
  POPULAR_COIN_PRESETS,
  RegulatedStateLabel,
  SupplyStateLabel,
} from "./coinInfoUtils";

interface CoinInfoData {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  description: string;
  iconUrl: string | null;
  metadataId: string | null;
  treasuryId: string | null;
  totalSupply: bigint | null;
  supplyState: SupplyStateLabel;
  regulatedState: RegulatedStateLabel;
  denyCapId: string | null;
  userBalance: bigint | null;
}

interface GrpcCoinInfoResponseLike {
  coinType?: string;
  metadata?: {
    id?: string;
    decimals?: number;
    name?: string;
    symbol?: string;
    description?: string;
    iconUrl?: string;
  };
  treasury?: {
    id?: string;
    totalSupply?: bigint | string;
    supplyState?: number;
  };
  regulatedMetadata?: {
    id?: string;
    denyCapObject?: string;
    coinRegulatedState?: number;
  };
}

interface CoinMetadataFallback {
  id?: string | null;
  decimals?: number;
  name?: string;
  symbol?: string;
  description?: string;
  iconUrl?: string | null;
}

const CoinInfo: React.FC = () => {
  const { t } = useTranslation();
  const suiClient = useCurrentClient();
  const currentAccount = useCurrentAccount();
  const network = useWalletNetwork(true);

  const [coinTypeInput, setCoinTypeInput] = useState<string>(SUI_TYPE_ARG);
  const [coinInfo, setCoinInfo] = useState<CoinInfoData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} ${t("common.copied")}`);
    } catch (error) {
      console.error("Failed to copy text:", error);
      toast.error(t("common.copyFailed"));
    }
  };

  const fetchCoinInfo = useCallback(
    async (rawCoinType: string) => {
      const normalized = normalizeCoinTypeInput(rawCoinType);
      if (!isValidCoinType(normalized)) {
        setErrorMessage(t("coinInfo.error.invalidCoinType"));
        setCoinInfo(null);
        return;
      }

      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setErrorMessage(null);

      try {
        let grpcResponse: GrpcCoinInfoResponseLike | null = null;
        let fallbackMetadata: CoinMetadataFallback | null = null;

        // Primary: Sui gRPC StateService.getCoinInfo returns metadata + treasury + regulated info
        try {
          const call = suiClient.stateService.getCoinInfo({
            coinType: normalized,
          });
          const res = await call.response;
          grpcResponse = res as GrpcCoinInfoResponseLike;
        } catch (grpcError) {
          console.error(
            "stateService.getCoinInfo failed, falling back:",
            grpcError,
          );
        }

        // Fallback: core getCoinMetadata if gRPC metadata is missing
        if (!grpcResponse?.metadata) {
          try {
            const metaRes = await suiClient.getCoinMetadata({
              coinType: normalized,
            });
            fallbackMetadata = metaRes.coinMetadata ?? null;
          } catch (metaError) {
            console.error("getCoinMetadata fallback failed:", metaError);
          }
        }

        const meta = grpcResponse?.metadata ?? fallbackMetadata;
        const treasury = grpcResponse?.treasury;
        const regulated = grpcResponse?.regulatedMetadata;

        if (!meta && !treasury) {
          if (requestId === requestIdRef.current) {
            setCoinInfo(null);
            setErrorMessage(t("coinInfo.error.notFound"));
          }
          return;
        }

        let userBalance: bigint | null = null;
        if (currentAccount) {
          try {
            const balanceRes = (await suiClient.getBalance({
              owner: currentAccount.address,
              coinType: normalized,
            })) as {
              balance?: { balance?: string };
              totalBalance?: string;
            };
            const rawBal =
              balanceRes.balance?.balance ?? balanceRes.totalBalance ?? "0";
            userBalance = BigInt(rawBal);
          } catch (balError) {
            console.error("Failed to fetch user balance for coin:", balError);
          }
        }

        if (requestId !== requestIdRef.current) return;

        const isSui = normalized === SUI_TYPE_ARG;
        const rawSupply = treasury?.totalSupply;
        const totalSupply =
          rawSupply !== undefined && rawSupply !== null
            ? BigInt(rawSupply)
            : null;

        setCoinInfo({
          coinType: grpcResponse?.coinType || normalized,
          name: meta?.name || normalized.split("::").pop() || normalized,
          symbol: meta?.symbol || normalized.split("::").pop() || "",
          decimals: meta?.decimals ?? 9,
          description: meta?.description || "",
          iconUrl: isSui
            ? "https://images.chaintoolkit.xyz/sui-logo.svg"
            : meta?.iconUrl || null,
          metadataId: meta?.id || null,
          treasuryId: treasury?.id || null,
          totalSupply,
          supplyState: parseSupplyState(treasury?.supplyState),
          regulatedState: parseRegulatedState(
            regulated?.coinRegulatedState,
            Boolean(regulated?.denyCapObject),
          ),
          denyCapId: regulated?.denyCapObject || null,
          userBalance,
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error("Error fetching coin info:", error);
        setCoinInfo(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t("coinInfo.error.fetchFailed"),
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [currentAccount, suiClient, t],
  );

  // Invalidate previous context immediately on network/account change, then re-query if valid
  useEffect(() => {
    requestIdRef.current += 1;
    setCoinInfo(null);
    setErrorMessage(null);
    setIsLoading(false);

    const timer = setTimeout(() => {
      if (isValidCoinType(coinTypeInput)) {
        void fetchCoinInfo(coinTypeInput);
      }
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, currentAccount?.address, suiClient]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchCoinInfo(coinTypeInput);
  };

  const handlePresetClick = (presetCoinType: string) => {
    setCoinTypeInput(presetCoinType);
    void fetchCoinInfo(presetCoinType);
  };

  const supplyStateBadgeColor: Record<SupplyStateLabel, string> = {
    fixed: "green",
    burnOnly: "orange",
    mutable: "blue",
  };

  const regulatedBadgeColor: Record<RegulatedStateLabel, string> = {
    regulated: "purple",
    unregulated: "gray",
    unknown: "gray",
  };

  const availablePresets = POPULAR_COIN_PRESETS.filter(
    (preset) => !preset.mainnetOnly || network === "mainnet",
  );

  return (
    <Container maxW="container.xl" py={8}>
      <Stack gap={6}>
        <Box>
          <Heading as="h1" mb={2}>
            {t("coinInfo.title")}
          </Heading>
          <Text color="gray.600">{t("coinInfo.description")}</Text>
        </Box>

        <Box p={5} borderWidth="1px" borderRadius="md" bg="white">
          <form onSubmit={handleSubmit}>
            <VStack align="stretch" gap={4}>
              <Text fontWeight="medium" fontSize="sm">
                {t("coinInfo.inputLabel")}
              </Text>
              <HStack gap={3}>
                <Input
                  value={coinTypeInput}
                  onChange={(e) => setCoinTypeInput(e.target.value)}
                  placeholder="0x2::sui::SUI"
                  fontFamily="mono"
                  size="md"
                />
                <Button
                  type="submit"
                  colorPalette="blue"
                  loading={isLoading}
                  px={6}
                >
                  <Icon as={FiSearch} mr={2} />
                  {t("coinInfo.search")}
                </Button>
              </HStack>

              <Flex alignItems="center" gap={2} flexWrap="wrap">
                <Text fontSize="xs" color="gray.500">
                  {t("coinInfo.quickPresets")}:
                </Text>
                {availablePresets.map((preset) => (
                  <Button
                    key={preset.coinType}
                    size="xs"
                    variant={
                      normalizeCoinTypeInput(coinTypeInput) === preset.coinType
                        ? "solid"
                        : "outline"
                    }
                    colorPalette="blue"
                    onClick={() => handlePresetClick(preset.coinType)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </Flex>
            </VStack>
          </form>
        </Box>

        {isLoading && (
          <Box
            p={10}
            borderWidth="1px"
            borderRadius="md"
            bg="white"
            textAlign="center"
          >
            <Spinner size="lg" />
            <Text mt={3} color="gray.600">
              {t("coinInfo.loading")}
            </Text>
          </Box>
        )}

        {!isLoading && errorMessage && (
          <Box
            p={4}
            borderWidth="1px"
            borderRadius="md"
            bg="red.50"
            borderColor="red.200"
          >
            <Text color="red.700" fontSize="sm">
              {errorMessage}
            </Text>
          </Box>
        )}

        {!isLoading && coinInfo && (
          <Box p={6} borderWidth="1px" borderRadius="md" bg="white">
            <VStack align="stretch" gap={6}>
              {/* Header */}
              <Flex
                justifyContent="space-between"
                alignItems="flex-start"
                flexWrap="wrap"
                gap={4}
              >
                <HStack gap={4}>
                  {coinInfo.iconUrl ? (
                    <img
                      src={coinInfo.iconUrl}
                      alt={coinInfo.symbol}
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <Flex
                      boxSize="48px"
                      borderRadius="full"
                      bg="blue.100"
                      color="blue.700"
                      align="center"
                      justify="center"
                      fontWeight="bold"
                      fontSize="lg"
                    >
                      {(coinInfo.symbol || "?").slice(0, 2).toUpperCase()}
                    </Flex>
                  )}
                  <Box>
                    <HStack gap={2} flexWrap="wrap">
                      <Heading as="h2" size="lg">
                        {coinInfo.name}
                      </Heading>
                      {coinInfo.symbol && (
                        <Badge colorPalette="blue" size="md">
                          {coinInfo.symbol}
                        </Badge>
                      )}
                      <Badge
                        colorPalette={
                          supplyStateBadgeColor[coinInfo.supplyState]
                        }
                        size="sm"
                      >
                        {t(`coinInfo.supplyState.${coinInfo.supplyState}`)}
                      </Badge>
                      <Badge
                        colorPalette={
                          regulatedBadgeColor[coinInfo.regulatedState]
                        }
                        size="sm"
                      >
                        {t(
                          `coinInfo.regulatedState.${coinInfo.regulatedState}`,
                        )}
                      </Badge>
                    </HStack>
                    {coinInfo.description && (
                      <Text color="gray.600" fontSize="sm" mt={1}>
                        {coinInfo.description}
                      </Text>
                    )}
                  </Box>
                </HStack>

                <Link
                  href={getExplorerCoinUrl(coinInfo.coinType, network)}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="blue.600"
                  fontSize="sm"
                  fontWeight="medium"
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                >
                  {t("coinInfo.viewInExplorer")}
                  <Icon as={FiExternalLink} boxSize={3.5} />
                </Link>
              </Flex>

              {/* Key Metrics */}
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
                <Box p={4} bg="gray.50" borderRadius="md" borderWidth="1px">
                  <Text fontSize="xs" color="gray.500" mb={1}>
                    {t("coinInfo.decimals")}
                  </Text>
                  <Text fontSize="xl" fontWeight="bold" fontFamily="mono">
                    {coinInfo.decimals}
                  </Text>
                </Box>

                <Box p={4} bg="gray.50" borderRadius="md" borderWidth="1px">
                  <Text fontSize="xs" color="gray.500" mb={1}>
                    {t("coinInfo.totalSupply")}
                  </Text>
                  <Text fontSize="xl" fontWeight="bold" fontFamily="mono">
                    {coinInfo.totalSupply !== null
                      ? `${formatCoinAmountWithDecimals(
                          coinInfo.totalSupply,
                          coinInfo.decimals,
                        )} ${coinInfo.symbol}`
                      : t("coinInfo.unavailable")}
                  </Text>
                  {coinInfo.totalSupply !== null && (
                    <Text
                      fontSize="xs"
                      color="gray.500"
                      fontFamily="mono"
                      mt={1}
                      wordBreak="break-all"
                    >
                      {t("coinInfo.rawSupply")}:{" "}
                      {coinInfo.totalSupply.toString()}
                    </Text>
                  )}
                </Box>

                <Box p={4} bg="gray.50" borderRadius="md" borderWidth="1px">
                  <Text fontSize="xs" color="gray.500" mb={1}>
                    {t("coinInfo.yourBalance")}
                  </Text>
                  <Text fontSize="xl" fontWeight="bold" fontFamily="mono">
                    {!currentAccount
                      ? t("coinInfo.connectWalletToView")
                      : coinInfo.userBalance !== null
                        ? `${formatCoinAmountWithDecimals(
                            coinInfo.userBalance,
                            coinInfo.decimals,
                          )} ${coinInfo.symbol}`
                        : "0"}
                  </Text>
                </Box>
              </SimpleGrid>

              {/* Identifiers */}
              <VStack align="stretch" gap={3}>
                <Box p={3} borderWidth="1px" borderRadius="md">
                  <Flex
                    justifyContent="space-between"
                    alignItems="center"
                    gap={2}
                  >
                    <Box minW={0}>
                      <Text fontSize="xs" color="gray.500">
                        {t("coinInfo.coinType")}
                      </Text>
                      <Text
                        fontFamily="mono"
                        fontSize="sm"
                        wordBreak="break-all"
                      >
                        {coinInfo.coinType}
                      </Text>
                    </Box>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        copyText(coinInfo.coinType, t("coinInfo.coinType"))
                      }
                    >
                      <Icon as={FiCopy} mr={1} />
                      {t("common.copy")}
                    </Button>
                  </Flex>
                </Box>

                {coinInfo.metadataId && (
                  <Box p={3} borderWidth="1px" borderRadius="md">
                    <Flex
                      justifyContent="space-between"
                      alignItems="center"
                      gap={2}
                    >
                      <Box minW={0}>
                        <Text fontSize="xs" color="gray.500">
                          {t("coinInfo.metadataId")}
                        </Text>
                        <Text
                          fontFamily="mono"
                          fontSize="sm"
                          wordBreak="break-all"
                        >
                          {coinInfo.metadataId}
                        </Text>
                      </Box>
                      <HStack gap={1} flexShrink={0}>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            copyText(
                              coinInfo.metadataId || "",
                              t("coinInfo.metadataId"),
                            )
                          }
                        >
                          <Icon as={FiCopy} mr={1} />
                          {t("common.copy")}
                        </Button>
                        <Link
                          href={getExplorerObjectUrl(
                            coinInfo.metadataId,
                            network,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          color="blue.500"
                          fontSize="xs"
                          px={2}
                        >
                          <Icon as={FiExternalLink} />
                        </Link>
                      </HStack>
                    </Flex>
                  </Box>
                )}

                {coinInfo.treasuryId && (
                  <Box p={3} borderWidth="1px" borderRadius="md">
                    <Flex
                      justifyContent="space-between"
                      alignItems="center"
                      gap={2}
                    >
                      <Box minW={0}>
                        <Text fontSize="xs" color="gray.500">
                          {t("coinInfo.treasuryCapId")}
                        </Text>
                        <Text
                          fontFamily="mono"
                          fontSize="sm"
                          wordBreak="break-all"
                        >
                          {coinInfo.treasuryId}
                        </Text>
                      </Box>
                      <HStack gap={1} flexShrink={0}>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            copyText(
                              coinInfo.treasuryId || "",
                              t("coinInfo.treasuryCapId"),
                            )
                          }
                        >
                          <Icon as={FiCopy} mr={1} />
                          {t("common.copy")}
                        </Button>
                        <Link
                          href={getExplorerObjectUrl(
                            coinInfo.treasuryId,
                            network,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          color="blue.500"
                          fontSize="xs"
                          px={2}
                        >
                          <Icon as={FiExternalLink} />
                        </Link>
                      </HStack>
                    </Flex>
                  </Box>
                )}

                {coinInfo.denyCapId && (
                  <Box p={3} borderWidth="1px" borderRadius="md">
                    <Flex
                      justifyContent="space-between"
                      alignItems="center"
                      gap={2}
                    >
                      <Box minW={0}>
                        <Text fontSize="xs" color="gray.500">
                          {t("coinInfo.denyCapId")}
                        </Text>
                        <Text
                          fontFamily="mono"
                          fontSize="sm"
                          wordBreak="break-all"
                        >
                          {coinInfo.denyCapId}
                        </Text>
                      </Box>
                      <HStack gap={1} flexShrink={0}>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            copyText(
                              coinInfo.denyCapId || "",
                              t("coinInfo.denyCapId"),
                            )
                          }
                        >
                          <Icon as={FiCopy} mr={1} />
                          {t("common.copy")}
                        </Button>
                        <Link
                          href={getExplorerObjectUrl(
                            coinInfo.denyCapId,
                            network,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          color="blue.500"
                          fontSize="xs"
                          px={2}
                        >
                          <Icon as={FiExternalLink} />
                        </Link>
                      </HStack>
                    </Flex>
                  </Box>
                )}
              </VStack>
            </VStack>
          </Box>
        )}
      </Stack>
    </Container>
  );
};

export default CoinInfo;

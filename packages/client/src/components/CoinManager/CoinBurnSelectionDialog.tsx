import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  Dialog,
  Portal,
  Checkbox,
  Flex,
  Box,
  Text,
  Badge,
  CloseButton,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { CoinObject } from "./types";
import { formatBalance, formatCoinId } from "./utils";
import {
  BurnableCoinObject,
  getBurnableCoinIds,
  getDefaultBurnSelectedIds,
  getReservedGasSuiCoinId,
  isCoinBurnable,
  isSuiCoinType,
  LOW_VALUE_THRESHOLD_USD,
} from "./rules";
import { calculateValue } from "../../utils/priceUtils";

interface CoinBurnSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedCoinIds: string[]) => void;
  coins: CoinObject[];
  coinType: string;
  symbol: string;
  price?: string | null | undefined;
  decimals: number;
  isLoading: boolean;
}

// For Checkbox.onCheckedChange type definition
interface CheckedChangeEvent {
  checked?: boolean | "indeterminate";
}

// Coin type group data structure for batch mode
interface CoinTypeGroupData {
  symbol: string;
  coins: BurnableCoinObject[];
  decimals: number;
  price: string | null;
  iconUrl?: string | null; // Add icon URL field
}

const CoinBurnSelectionDialog: React.FC<CoinBurnSelectionDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  coins,
  coinType,
  symbol,
  price,
  decimals,
  isLoading,
}) => {
  const { t } = useTranslation();
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const [selectedCoinIds, setSelectedCoinIds] = useState<string[]>([]);

  // Check if it's batch burn mode (multiple coin types)
  const isBatchMode = coinType === "batch-burn";

  // Group coins by type
  const coinsByType = React.useMemo(() => {
    if (!isBatchMode) {
      return {
        [coinType]: {
          symbol,
          coins: coins as BurnableCoinObject[],
          decimals,
          price: price ?? null,
          iconUrl: coins[0]?.iconUrl || null,
        },
      };
    }

    // For batch mode, group by coin type
    const byType: Record<string, CoinTypeGroupData> = {};

    (coins as BurnableCoinObject[]).forEach((coin: BurnableCoinObject) => {
      const type = coin.type || "";
      const normalizedType = isSuiCoinType(type) ? "0x2::sui::SUI" : type;

      if (!byType[normalizedType]) {
        const coinSymbol =
          coin.symbol || normalizedType.split("::").pop() || "Unknown";

        const iconUrl =
          normalizedType === "0x2::sui::SUI"
            ? "https://images.chaintoolkit.xyz/sui-logo.svg"
            : coin.iconUrl || null;

        byType[normalizedType] = {
          symbol: coinSymbol,
          coins: [],
          decimals: coin.decimals || decimals,
          price: coin.price || null,
          iconUrl,
        };
      }

      byType[normalizedType].coins.push({ ...coin });
    });

    // Sort coins, ensure SUI is always at the top
    const ordered: typeof byType = {};

    if (byType["0x2::sui::SUI"]) {
      ordered["0x2::sui::SUI"] = {
        ...byType["0x2::sui::SUI"],
        coins: [...byType["0x2::sui::SUI"].coins],
      };
      delete byType["0x2::sui::SUI"];
    }

    Object.keys(byType)
      .sort()
      .forEach((key) => {
        ordered[key] = {
          ...byType[key],
          coins: [...byType[key].coins],
        };
      });

    return ordered;
  }, [coins, coinType, symbol, decimals, price, isBatchMode]);

  // Auto-select burnable low-value coins (< $0.1) or coins without price data
  useEffect(() => {
    if (isOpen && coins.length > 0) {
      const autoSelected: string[] = [];

      Object.entries(coinsByType).forEach(([type, data]) => {
        autoSelected.push(
          ...getDefaultBurnSelectedIds(
            data.coins,
            type,
            data.decimals,
            data.price,
          ),
        );
      });

      setSelectedCoinIds(autoSelected);
    } else {
      setSelectedCoinIds([]);
    }
  }, [isOpen, coins.length, coinsByType]);

  // Listen for external events to force update selection state
  useEffect(() => {
    const handleUpdateCoins = (event: Event) => {
      if (isOpen && isBatchMode && coins.length > 0) {
        const customEvent = event as CustomEvent;
        const defaultSelectedIds = customEvent.detail?.defaultSelectedIds as
          string[] | undefined;

        const allBurnableIds = new Set(
          Object.entries(coinsByType).flatMap(([type, data]) =>
            getBurnableCoinIds(data.coins, type),
          ),
        );

        if (defaultSelectedIds && defaultSelectedIds.length > 0) {
          setSelectedCoinIds(
            defaultSelectedIds.filter((id) => allBurnableIds.has(id)),
          );
        } else {
          const autoSelected = Object.entries(coinsByType).flatMap(
            ([type, data]) =>
              getDefaultBurnSelectedIds(
                data.coins,
                type,
                data.decimals,
                data.price,
              ),
          );
          setSelectedCoinIds(autoSelected);
        }
      }
    };

    document.addEventListener("updateCoins", handleUpdateCoins);
    return () => {
      document.removeEventListener("updateCoins", handleUpdateCoins);
    };
  }, [isOpen, isBatchMode, coins.length, coinsByType]);

  const handleConfirm = () => {
    onConfirm(selectedCoinIds);
  };

  // Calculate total selectable (burnable) coins
  const getTotalSelectableCoins = useCallback(() => {
    return Object.entries(coinsByType).reduce(
      (sum, [type, data]) => sum + getBurnableCoinIds(data.coins, type).length,
      0,
    );
  }, [coinsByType]);

  const totalSelectable = getTotalSelectableCoins();
  const isAllSelected =
    selectedCoinIds.length > 0 && selectedCoinIds.length === totalSelectable;
  const isIndeterminate =
    selectedCoinIds.length > 0 && selectedCoinIds.length < totalSelectable;

  // Toggle selection of all burnable coins
  const toggleSelectAll = (checked: boolean) => {
    try {
      if (checked) {
        const allIds = Object.entries(coinsByType).flatMap(([type, data]) =>
          getBurnableCoinIds(data.coins, type),
        );
        setSelectedCoinIds(allIds);
      } else {
        setSelectedCoinIds([]);
      }
    } catch (error) {
      console.error("Error in toggleSelectAll:", error);
      setSelectedCoinIds([]);
    }
  };

  // Toggle selection of all burnable coins of a specific type
  const toggleCoinTypeSelection = (
    typeCoins: CoinObject[],
    type: string,
    checked: boolean,
  ) => {
    try {
      const validIds = getBurnableCoinIds(typeCoins, type);

      setSelectedCoinIds((prev) => {
        if (checked) {
          const currentSelected = new Set(prev);
          validIds.forEach((id) => currentSelected.add(id));
          return Array.from(currentSelected);
        } else {
          return prev.filter((id) => !validIds.includes(id));
        }
      });
    } catch (error) {
      console.error("Error in toggleCoinTypeSelection:", error);
    }
  };

  // Toggle single coin selection with burnable guard
  const toggleCoinSelection = (
    coinId: string,
    type: string,
    checked: boolean,
  ) => {
    try {
      setSelectedCoinIds((prev) => {
        const newSelection = new Set(prev);

        if (checked) {
          const typeCoins = coinsByType[type]?.coins || [];
          const coin = typeCoins.find((c) => c.id === coinId);

          if (!coin || !isCoinBurnable(coin, typeCoins, type)) {
            return prev;
          }

          newSelection.add(coinId);
        } else {
          newSelection.delete(coinId);
        }

        return Array.from(newSelection);
      });
    } catch (error) {
      console.error("Error in toggleCoinSelection:", error);
    }
  };

  const totalValueSelected =
    !isBatchMode && price
      ? selectedCoinIds.reduce((sum, id) => {
          const coin = coins.find((c) => c.id === id);
          if (coin) {
            return sum + calculateValue(coin.balance, price, decimals);
          }
          return sum;
        }, 0)
      : null;

  // Render coin type group in batch mode
  const renderCoinTypeGroup = (type: string, data: CoinTypeGroupData) => {
    const {
      symbol,
      coins: typeCoins,
      decimals,
      price: typePrice,
      iconUrl,
    } = data;

    // Prevent empty array causing render issues
    if (!Array.isArray(typeCoins) || typeCoins.length === 0) {
      return null;
    }

    const burnableIds = getBurnableCoinIds(typeCoins, type);
    const reservedGasSuiId = getReservedGasSuiCoinId(typeCoins, type);
    const selectedInType = typeCoins.filter((coin: CoinObject) =>
      selectedCoinIds.includes(coin.id),
    );
    const allSelected =
      burnableIds.length > 0 && selectedInType.length === burnableIds.length;
    const someSelected =
      selectedInType.length > 0 && selectedInType.length < burnableIds.length;

    return (
      <Box key={type} w="100%" borderWidth="1px" borderRadius="md" mb={3}>
        {/* Coin type title and selection */}
        <Flex
          p={3}
          bg="gray.100"
          justifyContent="space-between"
          alignItems="center"
          borderTopRadius="md"
        >
          <Flex alignItems="center">
            <Checkbox.Root
              checked={
                allSelected ? true : someSelected ? "indeterminate" : false
              }
              onCheckedChange={(e: CheckedChangeEvent) =>
                toggleCoinTypeSelection(typeCoins, type, !!e.checked)
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>
                <Flex alignItems="center" ml={2}>
                  {iconUrl ? (
                    <Box position="relative" boxSize="20px" mr={2}>
                      <img
                        src={iconUrl}
                        alt={symbol}
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                        onError={(e) => {
                          // Hide the image on error and show background color
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      {/* This will show when image fails to load */}
                      <Box
                        position="absolute"
                        top="0"
                        left="0"
                        boxSize="20px"
                        borderRadius="full"
                        bg="gray.200"
                        zIndex="-1"
                      />
                    </Box>
                  ) : (
                    <Box
                      boxSize="20px"
                      bg="gray.200"
                      borderRadius="full"
                      mr={2}
                    />
                  )}
                  <Text fontWeight="bold">
                    {symbol} ({typeCoins.length}){" "}
                    {!typePrice && !isBatchMode && (
                      <Badge colorPalette="yellow" size="sm">
                        {t("coinManager.noPrice")}
                      </Badge>
                    )}
                  </Text>
                </Flex>
              </Checkbox.Label>
            </Checkbox.Root>
          </Flex>
          <Text fontSize="sm">
            {selectedInType.length} / {typeCoins.length}{" "}
            {t("coinManager.selected")}
          </Text>
        </Flex>

        {/* Table header */}
        <Flex
          p={2}
          px={3}
          justifyContent="space-between"
          alignItems="center"
          bg="gray.50"
          fontWeight="medium"
        >
          <Box flex="0 0 24px"></Box>
          <Text flex="1 1 auto" pl={2} fontSize="sm">
            {t("coinManager.coinObject")}
          </Text>
          <Text flex="0 0 100px" textAlign="right" fontSize="sm">
            {t("coinManager.amount")}
          </Text>
          <Text flex="0 0 100px" textAlign="right" fontSize="sm">
            {t("coinManager.value")}
          </Text>
        </Flex>

        {/* Coin list */}
        <Box>
          {typeCoins.map((coin: CoinObject, index: number) => {
            const isSelected = selectedCoinIds.includes(coin.id);
            const isReservedGasSui = coin.id === reservedGasSuiId;
            const canBurn = isCoinBurnable(coin, typeCoins, type);
            // Calculate coin value
            let coinValue = null;
            if (typePrice) {
              coinValue = calculateValue(coin.balance, typePrice, decimals);
            }
            const isLowValue =
              coinValue !== null &&
              coinValue < LOW_VALUE_THRESHOLD_USD &&
              Number(coin.balance) > 0;

            return (
              <Flex
                key={coin.id}
                p={2}
                px={3}
                justifyContent="space-between"
                alignItems="center"
                bg={
                  isSelected
                    ? "blue.50"
                    : isReservedGasSui
                      ? "yellow.50"
                      : undefined
                }
                _hover={{ bg: isReservedGasSui ? "yellow.50" : "gray.50" }}
                borderTopWidth={index > 0 ? "1px" : 0}
                borderColor="gray.200"
              >
                <Checkbox.Root
                  checked={isSelected}
                  disabled={!canBurn}
                  onCheckedChange={(e: CheckedChangeEvent) =>
                    toggleCoinSelection(coin.id, type, !!e.checked)
                  }
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                </Checkbox.Root>

                <Text
                  fontFamily="mono"
                  fontSize="xs"
                  flex="1 1 auto"
                  pl={2}
                  title={coin.id}
                  color={isReservedGasSui ? "orange.500" : undefined}
                >
                  {formatCoinId(coin.id)}
                  {isReservedGasSui && (
                    <Badge ml={2} colorPalette="orange" size="sm">
                      {t("coinManager.gasReserved")}
                    </Badge>
                  )}
                </Text>

                <Text textAlign="right" flex="0 0 100px" fontSize="sm">
                  {formatBalance(coin.balance, decimals)}
                </Text>

                <Flex direction="column" alignItems="flex-end" flex="0 0 100px">
                  {coinValue !== null ? (
                    <>
                      <Text fontSize="sm">${coinValue.toFixed(4)}</Text>
                      {isLowValue && (
                        <Badge colorPalette="orange" size="sm">
                          {t("coinManager.lowValue")}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <Text fontSize="sm">-</Text>
                  )}
                </Flex>
              </Flex>
            );
          })}
        </Box>
      </Box>
    );
  };

  // Simplified mode, avoiding component nesting issues
  const renderBatchBurnView = () => {
    // Calculate total coin count in all groups
    const totalCoinsCount = Object.values(coinsByType).reduce(
      (sum, typeData) => {
        return sum + typeData.coins.length;
      },
      0,
    );

    return (
      <Box>
        <Text mb={4}>{t("coinManager.batchBurnCoinsDescription")}</Text>

        <Flex justifyContent="space-between" alignItems="center" mb={3}>
          <Checkbox.Root
            checked={
              isAllSelected ? true : isIndeterminate ? "indeterminate" : false
            }
            onCheckedChange={(e: CheckedChangeEvent) =>
              toggleSelectAll(!!e.checked)
            }
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>{t("coinManager.selectAll")}</Checkbox.Label>
          </Checkbox.Root>
          <Text fontSize="sm">
            {t("coinManager.selected")}: {selectedCoinIds.length} /{" "}
            {totalCoinsCount}
          </Text>
        </Flex>

        <Box maxH="500px" overflowY="auto">
          {Object.entries(coinsByType).map(([type, data]) =>
            renderCoinTypeGroup(type, data),
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Dialog.Root
      open={isOpen}
      role="alertdialog"
      onOpenChange={(details) => !details.open && onClose()}
      initialFocusEl={() => cancelRef.current}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Box maxW={isBatchMode ? "750px" : "600px"} w="100%">
              <Dialog.Header>
                <Dialog.Title>
                  {isBatchMode
                    ? t("coinManager.batchBurnCoinsTitle")
                    : t("coinManager.burnCoinsTitle", { symbol })}
                </Dialog.Title>
                <CloseButton
                  position="absolute"
                  right="4"
                  top="4"
                  size="sm"
                  onClick={onClose}
                />
              </Dialog.Header>

              <Dialog.Body>
                {isBatchMode ? (
                  // Batch burn view
                  renderBatchBurnView()
                ) : (
                  // Original single coin type mode
                  <>
                    <Text mb={4}>{t("coinManager.burnCoinsDescription")}</Text>

                    <Flex
                      justifyContent="space-between"
                      alignItems="center"
                      mb={3}
                    >
                      <Checkbox.Root
                        checked={
                          isAllSelected
                            ? true
                            : isIndeterminate
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(e: CheckedChangeEvent) =>
                          toggleSelectAll(!!e.checked)
                        }
                      >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                        <Checkbox.Label>
                          {t("coinManager.selectAll")}
                        </Checkbox.Label>
                      </Checkbox.Root>
                      <Text fontSize="sm">
                        {t("coinManager.selected")}: {selectedCoinIds.length} /{" "}
                        {totalSelectable}
                      </Text>
                    </Flex>

                    <Box maxH="500px" overflowY="auto">
                      <Box borderWidth="1px" borderRadius="md">
                        {/* Table header */}
                        <Flex
                          p={3}
                          justifyContent="space-between"
                          alignItems="center"
                          bg="gray.50"
                          borderBottomWidth="1px"
                          fontWeight="medium"
                        >
                          <Box flex="0 0 24px"></Box>
                          <Text flex="1 1 auto" pl={2}>
                            {t("coinManager.coinObject")}
                          </Text>
                          <Text flex="0 0 100px" textAlign="right">
                            {t("coinManager.amount")}
                          </Text>
                          <Text flex="0 0 100px" textAlign="right">
                            {t("coinManager.value")}
                          </Text>
                        </Flex>

                        <VStack align="stretch" divideY="1px">
                          {coins.map((coin) => {
                            const isSelected = selectedCoinIds.includes(
                              coin.id,
                            );
                            const isReservedGasSui =
                              coin.id ===
                              getReservedGasSuiCoinId(coins, coinType);
                            const canBurn = isCoinBurnable(
                              coin,
                              coins,
                              coinType,
                            );
                            const value = price
                              ? calculateValue(coin.balance, price, decimals)
                              : null;
                            const isLowValue =
                              value !== null &&
                              value < LOW_VALUE_THRESHOLD_USD &&
                              Number(coin.balance) > 0;

                            return (
                              <Flex
                                key={coin.id}
                                p={3}
                                justifyContent="space-between"
                                alignItems="center"
                                bg={
                                  isSelected
                                    ? "blue.50"
                                    : isReservedGasSui
                                      ? "yellow.50"
                                      : undefined
                                }
                                _hover={{
                                  bg: isReservedGasSui
                                    ? "yellow.50"
                                    : "gray.50",
                                }}
                              >
                                <Checkbox.Root
                                  checked={isSelected}
                                  disabled={!canBurn}
                                  onCheckedChange={(e: CheckedChangeEvent) =>
                                    toggleCoinSelection(
                                      coin.id,
                                      coinType,
                                      !!e.checked,
                                    )
                                  }
                                >
                                  <Checkbox.HiddenInput />
                                  <Checkbox.Control />
                                </Checkbox.Root>

                                <Text
                                  fontFamily="mono"
                                  fontSize="sm"
                                  flex="1 1 auto"
                                  pl={2}
                                  title={coin.id}
                                  color={
                                    isReservedGasSui ? "orange.500" : undefined
                                  }
                                >
                                  {formatCoinId(coin.id)}
                                  {isReservedGasSui && (
                                    <Badge
                                      ml={2}
                                      colorPalette="orange"
                                      size="sm"
                                    >
                                      {t("coinManager.gasReserved")}
                                    </Badge>
                                  )}
                                </Text>

                                <Text textAlign="right" flex="0 0 100px">
                                  {formatBalance(coin.balance, decimals)}
                                </Text>

                                <Flex
                                  direction="column"
                                  alignItems="flex-end"
                                  flex="0 0 100px"
                                >
                                  {value !== null ? (
                                    <>
                                      <Text>${value.toFixed(4)}</Text>
                                      {isLowValue && (
                                        <Badge colorPalette="orange" size="sm">
                                          {t("coinManager.lowValue")}
                                        </Badge>
                                      )}
                                    </>
                                  ) : (
                                    <Text>-</Text>
                                  )}
                                </Flex>
                              </Flex>
                            );
                          })}
                        </VStack>
                      </Box>
                    </Box>

                    {totalValueSelected !== null && (
                      <Text mt={3} textAlign="right">
                        {t("coinManager.totalValueSelected")}: $
                        {totalValueSelected.toFixed(4)}
                      </Text>
                    )}
                  </>
                )}
              </Dialog.Body>

              <Dialog.Footer>
                <Button ref={cancelRef} onClick={onClose} disabled={isLoading}>
                  {t("common.cancel")}
                </Button>
                <Button
                  colorPalette="red"
                  onClick={handleConfirm}
                  ml={3}
                  loading={isLoading}
                  loadingText={t("coinManager.loading")}
                  disabled={selectedCoinIds.length === 0}
                >
                  {t("coinManager.burnCoins")}
                </Button>
              </Dialog.Footer>
            </Box>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default CoinBurnSelectionDialog;

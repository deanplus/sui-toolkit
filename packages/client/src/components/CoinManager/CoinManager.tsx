import React, { useState, useEffect, useCallback } from "react";
import {
  Container,
  Heading,
  Text,
  Box,
  Flex,
  Stack,
  Button,
  Spinner,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import {
  useCurrentAccount,
  useCurrentClient,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import toast from "react-hot-toast";
import { formatCoinType } from "./utils";
import {
  BurnableCoinObject,
  capMergeCoinIds,
  getDefaultBurnSelectedIds,
  getMergeableCoinIds,
  isZeroBalance,
  resolveMergePlan,
  validateBurnSelection,
} from "./rules";
import { useWalletNetwork } from "../CustomConnectButton";
import { getPriceDirectAPI, calculateValue } from "../../utils/priceUtils";
import {
  MAX_MERGE_COIN_OBJECTS,
  USDC_COIN_TYPE,
  SUI_TYPE_ARG,
  WUSDC_COIN_TYPE,
  USDC_COIN_DECIMALS,
} from "../../utils/constants";

// Import types and subcomponents
import { CoinTypeSummary, LoadingState, CoinObject } from "./types";
import CoinTypesList from "./CoinTypesList";
import BurnConfirmationDialog from "./BurnConfirmationDialog";
import CoinBurnSelectionDialog from "./CoinBurnSelectionDialog";
import CoinOperationDialog from "./CoinOperationDialog";

interface RawCoinMetadata {
  decimals: number;
  symbol?: string;
  iconUrl?: string | null;
}

interface RawCoinObject {
  objectId?: string;
  coinObjectId?: string;
  balance: string | bigint | number;
}

const PRICE_FETCH_CONCURRENCY = 5;

const CoinManager: React.FC = () => {
  const { t } = useTranslation();
  const currentAccount = useCurrentAccount();
  const suiClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const walletNetwork = useWalletNetwork(true);
  const fetchRequestIdRef = React.useRef(0);

  const limitMergeCoinIds = useCallback(
    (coinIds: string[]) => {
      const { coinIds: cappedIds, wasCapped } = capMergeCoinIds(
        coinIds,
        MAX_MERGE_COIN_OBJECTS,
      );

      if (wasCapped) {
        toast(
          t("coinManager.mergeSelectionLimitNotice", {
            limit: MAX_MERGE_COIN_OBJECTS,
          }),
        );
      }

      return cappedIds;
    },
    [t],
  );

  // Unified loading state management
  const [loadingState, setLoadingState] = useState<LoadingState>({
    fetchCoins: false,
    batchMerge: false,
    batchCleanZero: false,
    batchBurn: false,
    singleOperation: false,
    fetchPrices: false,
    networkSync: true, // Default to waiting for network sync state
  });

  // State variables
  const [selectedCoinType, setSelectedCoinType] = useState<string | null>(null);
  const [coinTypeSummaries, setCoinTypeSummaries] = useState<CoinTypeSummary[]>(
    [],
  );
  const [selectedCoins, setSelectedCoins] = useState<Set<string>>(new Set());
  const [allCoinsForBurnDialog, setAllCoinsForBurnDialog] = useState<
    BurnableCoinObject[]
  >([]);

  // Confirmation dialog states
  const [burnConfirmation, setBurnConfirmation] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: "single" as "single" | "batch",
  });

  // New state for burn selection dialog
  const [burnSelectionDialog, setBurnSelectionDialog] = useState<{
    isOpen: boolean;
    coinType: string;
    symbol: string;
    onConfirm: (selectedCoinIds: string[]) => void;
    price: string | null;
    decimals: number;
  }>({
    isOpen: false,
    coinType: "",
    symbol: "",
    onConfirm: () => {},
    price: null,
    decimals: 9,
  });

  // Add new state for operation dialog
  const [operationDialog, setOperationDialog] = useState<{
    isOpen: boolean;
    coinType: string;
    symbol: string;
    onConfirm: (selectedCoinIds: string[]) => void;
    operationType: "merge" | "clean";
    decimals: number;
    iconUrl?: string | null;
  }>({
    isOpen: false,
    coinType: "",
    symbol: "",
    onConfirm: () => {},
    operationType: "merge",
    decimals: 9,
    iconUrl: null,
  });

  // Helper for toggling coin selection
  const toggleCoinSelection = (coinId: string) => {
    const newSelection = new Set(selectedCoins);
    if (newSelection.has(coinId)) {
      newSelection.delete(coinId);
    } else {
      newSelection.add(coinId);
    }
    setSelectedCoins(newSelection);
  };

  // Helper to toggle expansion of a coin type
  const toggleCoinTypeExpansion = (coinType: string) => {
    setCoinTypeSummaries((prevSummaries) =>
      prevSummaries.map((summary) =>
        summary.type === coinType
          ? { ...summary, expanded: !summary.expanded }
          : summary,
      ),
    );

    // Set the selected coin type
    setSelectedCoinType((prevType) =>
      prevType === coinType ? null : coinType,
    );

    // Reset selection when changing coin type
    setSelectedCoins(new Set());
  };

  // Fetch prices for all coins with bounded concurrency
  const fetchCoinPrices = useCallback(
    async (summaries: CoinTypeSummary[], requestId: number) => {
      if (!summaries.length) return;

      try {
        setLoadingState((prev) => ({ ...prev, fetchPrices: true }));
        const updatedSummaries = summaries.map((summary) => ({ ...summary }));
        let nextIndex = 0;

        const worker = async () => {
          while (nextIndex < updatedSummaries.length) {
            const currentIndex = nextIndex++;
            const summary = updatedSummaries[currentIndex];

            try {
              if (summary.type === USDC_COIN_TYPE) {
                summary.price = "1.0";
                summary.value =
                  Number(summary.totalBalance) / Math.pow(10, summary.decimals);
                continue;
              }

              const price = await getPriceDirectAPI(
                summary.type,
                summary.decimals,
                USDC_COIN_TYPE,
                USDC_COIN_DECIMALS,
              );

              summary.price = price;
              summary.value = price
                ? calculateValue(summary.totalBalance, price, summary.decimals)
                : null;
            } catch (error) {
              console.error(
                `Error fetching price for ${summary.symbol}:`,
                error,
              );
              summary.price = null;
              summary.value = null;
            }
          }
        };

        const workerCount = Math.min(
          PRICE_FETCH_CONCURRENCY,
          updatedSummaries.length,
        );
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        if (requestId === fetchRequestIdRef.current) {
          setCoinTypeSummaries(updatedSummaries);
        }
      } catch (error) {
        console.error("Error fetching coin prices:", error);
      } finally {
        if (requestId === fetchRequestIdRef.current) {
          setLoadingState((prev) => ({ ...prev, fetchPrices: false }));
        }
      }
    },
    [],
  );

  // Fetch all coins for the connected wallet
  const fetchAllCoins = useCallback(async () => {
    if (!currentAccount) return;

    const requestId = ++fetchRequestIdRef.current;

    try {
      setLoadingState((prev) => ({ ...prev, fetchCoins: true }));

      // Get all coin balances for the account using pagination
      const balances: Array<{ coinType: string; balance: string }> = [];
      let balanceCursor: string | null = null;

      while (true) {
        const balanceRes = await suiClient.listBalances({
          owner: currentAccount.address,
          limit: 50,
          cursor: balanceCursor,
        });

        balances.push(...balanceRes.balances);

        if (balanceRes.hasNextPage && balanceRes.cursor) {
          balanceCursor = balanceRes.cursor;
        } else {
          break;
        }
      }

      // Group coins by type
      const coinsByType = new Map<string, CoinObject[]>();
      const coinMetadata = new Map<
        string,
        { decimals: number; symbol: string; iconUrl: string | null }
      >();

      // Fetch metadata and individual coin objects for each coin type
      for (const balanceEntry of balances) {
        const coinType = balanceEntry.coinType;
        if (!coinType) continue;

        if (!coinMetadata.has(coinType)) {
          try {
            const metaRes = (await suiClient.getCoinMetadata({
              coinType,
            })) as
              | { coinMetadata?: RawCoinMetadata | null }
              | RawCoinMetadata
              | null;
            const metadata: RawCoinMetadata | null | undefined =
              metaRes && "coinMetadata" in metaRes
                ? metaRes.coinMetadata
                : (metaRes as RawCoinMetadata | null);

            if (metadata) {
              let symbol = metadata.symbol || formatCoinType(coinType);
              if (coinType === WUSDC_COIN_TYPE) symbol = "wUSDC";
              coinMetadata.set(coinType, {
                decimals: metadata.decimals,
                symbol: symbol,
                iconUrl: metadata.iconUrl || null,
              });
            } else {
              coinMetadata.set(coinType, {
                decimals: 9,
                symbol: formatCoinType(coinType),
                iconUrl: null,
              });
            }
          } catch (error) {
            console.error(`Error fetching metadata for ${coinType}:`, error);
            coinMetadata.set(coinType, {
              decimals: 9,
              symbol: formatCoinType(coinType),
              iconUrl: null,
            });
          }
        }

        const metadata = coinMetadata.get(coinType) || {
          decimals: 9,
          symbol: formatCoinType(coinType),
          iconUrl: null,
        };

        const isSuiCoin = coinType === SUI_TYPE_ARG;
        const iconUrl = isSuiCoin
          ? "https://images.chaintoolkit.xyz/sui-logo.svg"
          : metadata.iconUrl;

        let coinCursor: string | null = null;
        while (true) {
          const coinsRes = await suiClient.listCoins({
            owner: currentAccount.address,
            coinType,
            limit: 50,
            cursor: coinCursor,
          });

          const rawObjects = (coinsRes.objects || []) as RawCoinObject[];
          const formattedCoins: CoinObject[] = rawObjects.map((coin) => ({
            id: coin.objectId ?? coin.coinObjectId ?? "",
            balance: coin.balance.toString(),
            type: coinType,
            decimals: metadata.decimals,
            iconUrl,
          }));

          if (!coinsByType.has(coinType)) {
            coinsByType.set(coinType, []);
          }
          coinsByType.get(coinType)?.push(...formattedCoins);

          if (coinsRes.hasNextPage && coinsRes.cursor) {
            coinCursor = coinsRes.cursor;
          } else {
            break;
          }
        }
      }

      // Create summaries
      const summaries: CoinTypeSummary[] = [];

      for (const [type, coins] of coinsByType.entries()) {
        const totalBalance = coins
          .reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0))
          .toString();

        const metadata = coinMetadata.get(type) || {
          decimals: 9,
          symbol: formatCoinType(type),
          iconUrl: null,
        };

        // Special handling for SUI coin icon
        const isSuiCoin = type === SUI_TYPE_ARG;
        const iconUrl = isSuiCoin
          ? "https://images.chaintoolkit.xyz/sui-logo.svg"
          : metadata.iconUrl;

        summaries.push({
          type,
          symbol: metadata.symbol,
          totalBalance,
          objectCount: coins.length,
          objects: coins,
          expanded: false,
          decimals: metadata.decimals,
          iconUrl: iconUrl, // Use special SUI icon or metadata icon
        });
      }

      // Sort by type (SUI first, then others alphabetically)
      summaries.sort((a, b) => {
        if (a.type === SUI_TYPE_ARG) return -1;
        if (b.type === SUI_TYPE_ARG) return 1;
        return a.type.localeCompare(b.type);
      });

      if (requestId !== fetchRequestIdRef.current) {
        return;
      }

      setCoinTypeSummaries(summaries);

      // Fetch prices for all coin types
      await fetchCoinPrices(summaries, requestId);
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      console.error("Error fetching coins:", error);
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.unknownError"),
      );
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoadingState((prev) => ({ ...prev, fetchCoins: false }));
      }
    }
  }, [currentAccount, suiClient, t, fetchCoinPrices]);

  // Check if there's any coin type with multiple objects (can be merged)
  const hasMergeableCoins = coinTypeSummaries.some(
    (summary) => getMergeableCoinIds(summary.objects, summary.type).length > 0,
  );

  // Check if there's any zero balance coin object
  const hasZeroBalanceCoins = coinTypeSummaries.some((summary) =>
    summary.objects.some((coin) => isZeroBalance(coin.balance)),
  );

  // Generic transaction execution function to reduce code duplication
  const executeTransaction = async (
    tx: Transaction,
    successMessage: string,
    operationType:
      "batchMerge" | "batchCleanZero" | "batchBurn" | "singleOperation",
  ) => {
    try {
      setLoadingState((prev) => ({ ...prev, [operationType]: true }));

      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });

      toast.success(successMessage);
      // Add a delay before resolving to allow blockchain state to update
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { success: true, result };
    } catch (error) {
      console.error("Transaction execution error:", error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : t("coinManager.error.unknownError");
      toast.error(t("coinManager.error.operationFailed") + ": " + errorMsg);
      throw error;
    } finally {
      setLoadingState((prev) => ({ ...prev, [operationType]: false }));
    }
  };

  // Optimized batch merge function
  const handleBatchMerge = async () => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    const mergeableCoinTypes = coinTypeSummaries.filter(
      (summary) =>
        getMergeableCoinIds(summary.objects, summary.type).length > 0,
    );

    if (mergeableCoinTypes.length === 0) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.noMergeableCoins"),
      );
      return;
    }

    // Show merge selection dialog
    setOperationDialog({
      isOpen: true,
      coinType: "batch-operation",
      symbol: t("coinManager.multipleCoins"),
      decimals: 9,
      operationType: "merge",
      onConfirm: async (selectedCoinIds: string[]) => {
        setOperationDialog((prev) => ({ ...prev, isOpen: false }));

        try {
          setLoadingState((prev) => ({ ...prev, batchMerge: true }));

          // Create a transaction
          const tx = new Transaction();
          const coinsByType = new Map<string, string[]>();

          // Group selected coins by type
          limitMergeCoinIds(selectedCoinIds).forEach((coinId) => {
            for (const summary of coinTypeSummaries) {
              const coin = summary.objects.find((c) => c.id === coinId);
              if (coin) {
                if (!coinsByType.has(summary.type)) {
                  coinsByType.set(summary.type, []);
                }
                coinsByType.get(summary.type)?.push(coinId);
                break;
              }
            }
          });

          // Process each coin type
          for (const [type, coinIds] of coinsByType.entries()) {
            const summary = coinTypeSummaries.find((s) => s.type === type);
            if (!summary) continue;

            const mergePlan = resolveMergePlan(
              summary.objects,
              coinIds,
              type,
              MAX_MERGE_COIN_OBJECTS,
            );
            if (!mergePlan) continue;

            tx.mergeCoins(mergePlan.primaryCoinId, mergePlan.otherCoinIds);
          }

          // Execute transaction
          await executeTransaction(
            tx,
            t("coinManager.batchMergeSuccess"),
            "batchMerge",
          );

          // Refresh coin list
          fetchAllCoins();
        } catch (error) {
          console.error("Error batch merging coins:", error);
          toast.error(
            t("coinManager.error.operationFailed") +
              ": " +
              (error instanceof Error
                ? error.message
                : t("coinManager.error.unknownError")),
          );
        } finally {
          setLoadingState((prev) => ({ ...prev, batchMerge: false }));
        }
      },
    });
  };

  // Optimized batch clean zero balance coins function
  const handleBatchCleanZero = async () => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    const coinTypesWithZeroBalance = coinTypeSummaries.filter((summary) =>
      summary.objects.some((coin) => isZeroBalance(coin.balance)),
    );

    if (coinTypesWithZeroBalance.length === 0) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.noZeroCoins"),
      );
      return;
    }

    // Show clean selection dialog
    setOperationDialog({
      isOpen: true,
      coinType: "batch-operation",
      symbol: t("coinManager.multipleCoins"),
      decimals: 9,
      operationType: "clean",
      onConfirm: async (selectedCoinIds: string[]) => {
        setOperationDialog((prev) => ({ ...prev, isOpen: false }));

        try {
          setLoadingState((prev) => ({ ...prev, batchCleanZero: true }));

          // Create a single transaction for all zero-balance coins
          const tx = new Transaction();

          // Process selected coins
          for (const coinId of selectedCoinIds) {
            // Find the coin type
            let coinType = "";
            for (const summary of coinTypeSummaries) {
              const coin = summary.objects.find((c) => c.id === coinId);
              if (coin) {
                coinType = summary.type;
                break;
              }
            }

            if (coinType) {
              tx.moveCall({
                target: "0x2::coin::destroy_zero",
                arguments: [tx.object(coinId)],
                typeArguments: [coinType],
              });
            }
          }

          // Execute transaction
          await executeTransaction(
            tx,
            `${t("coinManager.batchCleanSuccess")}: ${selectedCoinIds.length} ${t("coinManager.objects")}`,
            "batchCleanZero",
          );

          // Refresh coin list
          fetchAllCoins();
        } catch (error) {
          console.error("Error batch cleaning zero-balance coins:", error);
          toast.error(
            t("coinManager.error.operationFailed") +
              ": " +
              (error instanceof Error
                ? error.message
                : t("coinManager.error.unknownError")),
          );
        } finally {
          setLoadingState((prev) => ({ ...prev, batchCleanZero: false }));
        }
      },
    });
  };

  // Optimized merge function for single coin type
  const autoMergeCoins = async (coinType: string) => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    const summary = coinTypeSummaries.find((s) => s.type === coinType);
    if (!summary) return;

    if (getMergeableCoinIds(summary.objects, coinType).length === 0) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.notEnoughCoins"),
      );
      return;
    }

    // Show merge dialog
    setOperationDialog({
      isOpen: true,
      coinType: coinType,
      symbol: summary.symbol,
      decimals: summary.decimals,
      operationType: "merge",
      iconUrl: summary.iconUrl,
      onConfirm: async (selectedCoinIds: string[]) => {
        setOperationDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setLoadingState((prev) => ({ ...prev, singleOperation: true }));
          const tx = new Transaction();

          const mergePlan = resolveMergePlan(
            summary.objects,
            selectedCoinIds,
            coinType,
            MAX_MERGE_COIN_OBJECTS,
          );

          if (!mergePlan) {
            toast.error(
              t("coinManager.error.title") +
                ": " +
                t("coinManager.error.notEnoughCoins"),
            );
            return;
          }

          if (mergePlan.wasCapped) {
            toast(
              t("coinManager.mergeSelectionLimitNotice", {
                limit: MAX_MERGE_COIN_OBJECTS,
              }),
            );
          }

          tx.mergeCoins(mergePlan.primaryCoinId, mergePlan.otherCoinIds);

          await executeTransaction(
            tx,
            t("coinManager.mergeSuccess"),
            "singleOperation",
          );

          setSelectedCoins(new Set());
          fetchAllCoins();
        } catch (error) {
          console.error("Error preparing merge transaction:", error);
          toast.error(
            t("coinManager.error.operationFailed") +
              ": " +
              (error instanceof Error
                ? error.message
                : t("coinManager.error.unknownError")),
          );
        } finally {
          setLoadingState((prev) => ({ ...prev, singleOperation: false }));
        }
      },
    });
  };

  // Optimized clean zero balance coins for single coin type
  const handleCleanZeroCoins = async (coinType: string) => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    const summary = coinTypeSummaries.find((s) => s.type === coinType);
    if (!summary) return;

    // Filter zero balance coins
    const zeroBalanceCoins = summary.objects.filter((coin) =>
      isZeroBalance(coin.balance),
    );

    if (zeroBalanceCoins.length === 0) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.noZeroCoins"),
      );
      return;
    }

    // Show clean dialog with only zero balance coins
    setOperationDialog({
      isOpen: true,
      coinType: coinType,
      symbol: summary.symbol,
      decimals: summary.decimals,
      operationType: "clean",
      iconUrl: summary.iconUrl,
      onConfirm: async (selectedCoinIds: string[]) => {
        setOperationDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setLoadingState((prev) => ({ ...prev, singleOperation: true }));
          const tx = new Transaction();

          // Process selected coins
          for (const coinId of selectedCoinIds) {
            // Double check that we only process zero balance coins
            const coin = zeroBalanceCoins.find((c) => c.id === coinId);
            if (coin) {
              tx.moveCall({
                target: "0x2::coin::destroy_zero",
                arguments: [tx.object(coinId)],
                typeArguments: [coinType],
              });
            }
          }

          await executeTransaction(
            tx,
            `${t("coinManager.cleanSuccess")}: ${selectedCoinIds.length} ${t("coinManager.objects")}`,
            "singleOperation",
          );

          fetchAllCoins();
        } catch (error) {
          console.error("Error preparing clean transaction:", error);
        } finally {
          setLoadingState((prev) => ({ ...prev, singleOperation: false }));
        }
      },
    });
  };

  // Handle burn selected coins for a specific coin type
  const handleBurnSelectedCoins = async () => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    const selectedCoinsArray = Array.from(selectedCoins);
    const validation = validateBurnSelection(
      selectedCoinsArray,
      coinTypeSummaries,
    );
    if (!validation.valid) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t(
            validation.reason === "cannotBurnLastSui"
              ? "coinManager.error.cannotBurnLastSui"
              : "coinManager.error.noCoinsSelected",
          ),
      );
      return;
    }

    // Show confirmation dialog
    setBurnConfirmation({
      isOpen: true,
      title: t("coinManager.confirmBurn"),
      message: t("coinManager.confirmBurnMessage", {
        count: selectedCoinsArray.length,
      }),
      type: "single",
      onConfirm: async () => {
        setBurnConfirmation((prev) => ({ ...prev, isOpen: false }));

        try {
          setLoadingState((prev) => ({ ...prev, singleOperation: true }));

          // Create transaction
          const tx = new Transaction();

          // Transfer to zero address (0x0) for both SUI and other coins
          for (const coinId of selectedCoinsArray) {
            tx.transferObjects([tx.object(coinId)], tx.pure.address("0x0"));
          }

          // Execute transaction
          await executeTransaction(
            tx,
            `${t("coinManager.burnSuccess")}: ${selectedCoinsArray.length} ${t("coinManager.objects")}`,
            "singleOperation",
          );

          // Reset selection and refresh coin list
          setSelectedCoins(new Set());
          fetchAllCoins();
        } catch (error) {
          console.error("Error burning coins:", error);
          toast.error(
            t("coinManager.error.operationFailed") +
              ": " +
              (error instanceof Error
                ? error.message
                : t("coinManager.error.unknownError")),
          );
        } finally {
          setLoadingState((prev) => ({ ...prev, singleOperation: false }));
        }
      },
    });
  };

  // Handle batch burning of coins (show all coins, default select low value coins)
  const handleBatchBurnLowValueCoins = async () => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    // Create extended coin object list with price and other necessary information
    const batchCoins: BurnableCoinObject[] = [];
    // Record low value coin IDs for default selection (always protecting gas SUI)
    const lowValueCoinIds: string[] = [];

    for (const summary of coinTypeSummaries) {
      const extendedObjects: BurnableCoinObject[] = summary.objects.map(
        (coin) => ({
          ...coin,
          symbol: summary.symbol,
          decimals: summary.decimals,
          price: summary.price,
          type: summary.type,
        }),
      );

      batchCoins.push(...extendedObjects);
      lowValueCoinIds.push(
        ...getDefaultBurnSelectedIds(
          extendedObjects,
          summary.type,
          summary.decimals,
          summary.price,
        ),
      );
    }

    if (batchCoins.length === 0) {
      toast.error(
        t("coinManager.error.title") + ": " + t("coinManager.error.noCoins"),
      );
      return;
    }

    // Update state
    setAllCoinsForBurnDialog(batchCoins);

    // Set up batch burn dialog
    setBurnSelectionDialog({
      isOpen: true,
      coinType: "batch-burn", // Use special identifier for batch burn mode
      symbol: t("coinManager.multipleCoins"),
      price: null, // Mixed coin types, no unified price
      decimals: 9, // Default precision
      onConfirm: (selectedCoinIds: string[]) => {
        handleBatchBurnConfirmed(selectedCoinIds);
      },
    });

    // Set default selected coins after dialog initialization
    setTimeout(() => {
      const dialogElement = document.querySelector(".chakra-modal__content");
      if (dialogElement) {
        // Create custom event to pass default selected coin IDs
        const event = new CustomEvent("updateCoins", {
          bubbles: true,
          detail: { defaultSelectedIds: lowValueCoinIds },
        });
        dialogElement.dispatchEvent(event);
      }
    }, 100);
  };

  // Handle batch burn confirmation
  const handleBatchBurnConfirmed = async (coinIds: string[]) => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    const validation = validateBurnSelection(coinIds, coinTypeSummaries);
    if (!validation.valid) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t(
            validation.reason === "cannotBurnLastSui"
              ? "coinManager.error.cannotBurnLastSui"
              : "coinManager.error.noCoinsSelected",
          ),
      );
      return;
    }

    setBurnSelectionDialog((prev) => ({ ...prev, isOpen: false }));

    // Create message text, including a note that some coins may not have price data
    const messageText = t("coinManager.confirmBurnMessage", {
      count: coinIds.length,
    });

    // Show confirmation dialog
    setBurnConfirmation({
      isOpen: true,
      title: t("coinManager.confirmBatchBurn"),
      message: messageText,
      type: "batch",
      onConfirm: async () => {
        setBurnConfirmation((prev) => ({ ...prev, isOpen: false }));

        try {
          setLoadingState((prev) => ({ ...prev, batchBurn: true }));

          // Create transaction
          const tx = new Transaction();
          let burnCount = 0;

          // Transfer all selected coins to zero address (0x0)
          for (const coinId of coinIds) {
            tx.transferObjects([tx.object(coinId)], tx.pure.address("0x0"));
            burnCount++;
          }

          if (burnCount === 0) {
            toast.error(
              t("coinManager.error.title") +
                ": " +
                t("coinManager.error.noCoinsSelected"),
            );
            setLoadingState((prev) => ({ ...prev, batchBurn: false }));
            return;
          }

          // Execute transaction
          await executeTransaction(
            tx,
            `${t("coinManager.batchBurnSuccess")}: ${burnCount} ${t("coinManager.objects")}`,
            "batchBurn",
          );

          // Refresh coin list
          fetchAllCoins();
        } catch (error) {
          console.error("Error batch burning coins:", error);
          toast.error(
            t("coinManager.error.operationFailed") +
              ": " +
              (error instanceof Error
                ? error.message
                : t("coinManager.error.unknownError")),
          );
        } finally {
          setLoadingState((prev) => ({ ...prev, batchBurn: false }));
        }
      },
    });
  };

  // Handle the burn dialog showing
  const handleShowBurnDialog = (coinType: string) => {
    const summary = coinTypeSummaries.find((s) => s.type === coinType);
    if (!summary) return;

    setBurnSelectionDialog({
      isOpen: true,
      coinType: coinType,
      symbol: summary.symbol,
      price: summary.price || null,
      decimals: summary.decimals,
      onConfirm: (selectedCoinIds: string[]) => {
        handleBurnCoins(selectedCoinIds);
      },
    });
  };

  // Reset selection when dialog closes
  const handleBurnDialogClose = () => {
    setBurnSelectionDialog((prev) => ({ ...prev, isOpen: false }));
    // Don't reset selection here, as it might be a cancel operation
  };

  // Handle burning a single coin
  const handleBurnSingleCoin = async (coinId: string) => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    // Find the coin object and its type
    let foundCoinType = "";
    let foundCoin: CoinObject | null = null;
    let foundSummary: CoinTypeSummary | null = null;

    for (const summary of coinTypeSummaries) {
      const coin = summary.objects.find((c) => c.id === coinId);
      if (coin) {
        foundCoinType = summary.type;
        foundCoin = coin;
        foundSummary = summary;
        break;
      }
    }

    if (!foundCoinType || !foundCoin || !foundSummary) {
      console.error("Coin not found:", coinId);
      return;
    }

    const validation = validateBurnSelection([coinId], coinTypeSummaries);
    if (!validation.valid) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.cannotBurnLastSui"),
      );
      return;
    }

    // Format balance according to decimals
    const formattedBalance = (
      Number(foundCoin.balance) / Math.pow(10, foundSummary.decimals)
    ).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: foundSummary.decimals,
    });

    // Show confirmation dialog
    setBurnConfirmation({
      isOpen: true,
      title: t("coinManager.confirmBurnSingle"),
      message: t("coinManager.confirmBurnSingleMessage", {
        balance: formattedBalance,
        symbol: foundSummary.symbol || formatCoinType(foundCoinType),
      }),
      type: "single",
      onConfirm: async () => {
        setBurnConfirmation((prev) => ({ ...prev, isOpen: false }));

        try {
          setLoadingState((prev) => ({ ...prev, singleOperation: true }));

          // Create transaction
          const tx = new Transaction();

          // Transfer to zero address (0x0)
          tx.transferObjects([tx.object(coinId)], tx.pure.address("0x0"));

          // Execute transaction
          await executeTransaction(
            tx,
            t("coinManager.burnSuccess") + ": 1 " + t("coinManager.object"),
            "singleOperation",
          );

          // Refresh coin list
          fetchAllCoins();
        } catch (error) {
          console.error("Error burning coin:", error);
          toast.error(
            t("coinManager.error.operationFailed") +
              ": " +
              (error instanceof Error
                ? error.message
                : t("coinManager.error.unknownError")),
          );
        } finally {
          setLoadingState((prev) => ({ ...prev, singleOperation: false }));
        }
      },
    });
  };

  // Handle burning multiple selected coins
  const handleBurnCoins = async (coinIds: string[]) => {
    if (!currentAccount) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t("coinManager.error.connectWallet"),
      );
      return;
    }

    const validation = validateBurnSelection(coinIds, coinTypeSummaries);
    if (!validation.valid) {
      toast.error(
        t("coinManager.error.title") +
          ": " +
          t(
            validation.reason === "cannotBurnLastSui"
              ? "coinManager.error.cannotBurnLastSui"
              : "coinManager.error.noCoinsSelected",
          ),
      );
      return;
    }

    setBurnSelectionDialog((prev) => ({ ...prev, isOpen: false }));

    // Show confirmation dialog
    setBurnConfirmation({
      isOpen: true,
      title: t("coinManager.confirmBurn"),
      message: t("coinManager.confirmBurnMessage", { count: coinIds.length }),
      type: "single",
      onConfirm: async () => {
        setBurnConfirmation((prev) => ({ ...prev, isOpen: false }));

        try {
          setLoadingState((prev) => ({ ...prev, singleOperation: true }));

          // Create transaction
          const tx = new Transaction();

          // Transfer all coins to zero address (0x0)
          for (const coinId of coinIds) {
            tx.transferObjects([tx.object(coinId)], tx.pure.address("0x0"));
          }

          // Execute transaction
          await executeTransaction(
            tx,
            `${t("coinManager.burnSuccess")}: ${coinIds.length} ${t("coinManager.objects")}`,
            "singleOperation",
          );

          // Reset selection and refresh coin list
          setSelectedCoins(new Set());
          fetchAllCoins();
        } catch (error) {
          console.error("Error burning coins:", error);
          toast.error(
            t("coinManager.error.operationFailed") +
              ": " +
              (error instanceof Error
                ? error.message
                : t("coinManager.error.unknownError")),
          );
        } finally {
          setLoadingState((prev) => ({ ...prev, singleOperation: false }));
        }
      },
    });
  };

  // Load coins automatically when account changes or network changes
  useEffect(() => {
    // Invalidate any in-flight requests from the previous network/account
    fetchRequestIdRef.current += 1;
    setCoinTypeSummaries([]);
    setSelectedCoinType(null);
    setSelectedCoins(new Set());
    setLoadingState((prev) => ({
      ...prev,
      networkSync: true,
      fetchCoins: false,
      fetchPrices: false,
    }));

    // Wait briefly for wallet/dApp network sync before querying
    const timer = setTimeout(() => {
      setLoadingState((prev) => ({ ...prev, networkSync: false }));
      if (currentAccount) {
        void fetchAllCoins();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [currentAccount, walletNetwork, fetchAllCoins]);

  return (
    <Container maxW="container.xl" py={8}>
      <Stack direction="column" gap={6}>
        <Box>
          <Heading as="h1" mb={2}>
            {t("coinManager.title")}
          </Heading>
          <Text color="gray.600" mb={2}>
            {t("coinManager.description")}
          </Text>

          {/* Add manual refresh button */}
          <Button
            size="sm"
            colorPalette="green"
            variant="outline"
            onClick={fetchAllCoins}
            loading={loadingState.fetchCoins}
            loadingText={t("coinManager.loading")}
          >
            <Flex gap="2" alignItems="center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" />
              </svg>
              {t("coinManager.refreshCoins")}
            </Flex>
          </Button>
        </Box>

        <Box p={5} borderWidth="1px" borderRadius="md" bg="white">
          <Stack direction="column" gap={4}>
            {/* Coin Type Summary */}
            <Box>
              <Flex justifyContent="space-between" alignItems="center" mb={4}>
                <Text fontWeight="medium">{t("coinManager.coinList")}</Text>
                <Flex gap={3}>
                  <Button
                    size="sm"
                    colorPalette="blue"
                    variant="solid"
                    loadingText={t("coinManager.loading")}
                    disabled={
                      !hasMergeableCoins ||
                      loadingState.fetchCoins ||
                      loadingState.batchMerge ||
                      loadingState.batchCleanZero ||
                      loadingState.singleOperation
                    }
                    onClick={handleBatchMerge}
                    title={
                      !hasMergeableCoins
                        ? t("coinManager.error.notEnoughCoins")
                        : t("coinManager.batchMerge")
                    }
                    loading={loadingState.batchMerge}
                  >
                    {t("coinManager.batchMerge")}
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="red"
                    variant="solid"
                    loadingText={t("coinManager.loading")}
                    disabled={
                      !hasZeroBalanceCoins ||
                      loadingState.fetchCoins ||
                      loadingState.batchMerge ||
                      loadingState.batchCleanZero ||
                      loadingState.singleOperation
                    }
                    onClick={handleBatchCleanZero}
                    title={
                      !hasZeroBalanceCoins
                        ? t("coinManager.error.noZeroCoins")
                        : t("coinManager.batchClean")
                    }
                    loading={loadingState.batchCleanZero}
                  >
                    {t("coinManager.batchClean")}
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="orange"
                    variant="solid"
                    loadingText={t("coinManager.loading")}
                    disabled={
                      loadingState.fetchCoins ||
                      loadingState.batchMerge ||
                      loadingState.batchCleanZero ||
                      loadingState.batchBurn ||
                      loadingState.singleOperation
                    }
                    onClick={handleBatchBurnLowValueCoins}
                    title={t("coinManager.batchBurn")}
                    loading={loadingState.batchBurn}
                  >
                    {t("coinManager.batchBurn")}
                  </Button>
                </Flex>
              </Flex>

              {loadingState.networkSync ||
              loadingState.fetchCoins ||
              loadingState.fetchPrices ? (
                <Box textAlign="center" py={10}>
                  <Spinner size="xl" />
                  <Text mt={4}>
                    {loadingState.networkSync
                      ? t("coinManager.syncingNetwork")
                      : loadingState.fetchPrices
                        ? t("coinManager.loadingPrices")
                        : t("coinManager.loading")}
                  </Text>
                </Box>
              ) : coinTypeSummaries.length === 0 ? (
                <Box p={4} bg="teal.50" color="teal.800" borderRadius="md">
                  <Text>{t("coinManager.noCoins")}</Text>
                </Box>
              ) : (
                <CoinTypesList
                  coinTypeSummaries={coinTypeSummaries}
                  selectedCoinType={selectedCoinType}
                  selectedCoins={selectedCoins}
                  isLoading={loadingState.singleOperation}
                  onToggleCoinTypeExpansion={toggleCoinTypeExpansion}
                  onToggleCoinSelection={toggleCoinSelection}
                  onMergeCoin={autoMergeCoins}
                  onCleanZeroCoins={handleCleanZeroCoins}
                  onBurnCoin={handleBurnSelectedCoins}
                  onBurnSingleCoin={handleBurnSingleCoin}
                  onShowBurnDialog={handleShowBurnDialog}
                />
              )}
            </Box>
          </Stack>
        </Box>
      </Stack>

      {/* Burn confirmation dialog */}
      <BurnConfirmationDialog
        isOpen={burnConfirmation.isOpen}
        title={burnConfirmation.title}
        onClose={() =>
          setBurnConfirmation((prev) => ({ ...prev, isOpen: false }))
        }
        onConfirm={burnConfirmation.onConfirm}
        message={burnConfirmation.message}
        isLoading={
          burnConfirmation.type === "single"
            ? loadingState.singleOperation
            : loadingState.batchBurn
        }
      />

      {/* Burn selection dialog */}
      <CoinBurnSelectionDialog
        isOpen={burnSelectionDialog.isOpen}
        onClose={handleBurnDialogClose}
        onConfirm={burnSelectionDialog.onConfirm}
        coins={
          burnSelectionDialog.coinType === "batch-burn"
            ? allCoinsForBurnDialog || []
            : coinTypeSummaries.find(
                (s) => s.type === burnSelectionDialog.coinType,
              )?.objects || []
        }
        coinType={burnSelectionDialog.coinType}
        symbol={burnSelectionDialog.symbol}
        price={
          burnSelectionDialog.coinType === "batch-burn"
            ? null
            : coinTypeSummaries.find(
                (s) => s.type === burnSelectionDialog.coinType,
              )?.price || null
        }
        decimals={burnSelectionDialog.decimals}
        isLoading={
          burnSelectionDialog.coinType === "batch-burn"
            ? loadingState.batchBurn
            : loadingState.singleOperation
        }
      />

      {/* Operation dialog */}
      <CoinOperationDialog
        isOpen={operationDialog.isOpen}
        onClose={() =>
          setOperationDialog((prev) => ({ ...prev, isOpen: false }))
        }
        onConfirm={operationDialog.onConfirm}
        coins={
          operationDialog.coinType === "batch-operation"
            ? coinTypeSummaries.flatMap((summary) =>
                summary.objects.map((coin) => ({
                  ...coin,
                  symbol: summary.symbol,
                  iconUrl: summary.iconUrl,
                })),
              )
            : coinTypeSummaries.find((s) => s.type === operationDialog.coinType)
                ?.objects || []
        }
        coinType={operationDialog.coinType}
        symbol={operationDialog.symbol}
        decimals={operationDialog.decimals}
        isLoading={
          operationDialog.operationType === "merge"
            ? loadingState.batchMerge
            : loadingState.batchCleanZero
        }
        operationType={operationDialog.operationType}
        iconUrl={operationDialog.iconUrl}
      />
    </Container>
  );
};

export default CoinManager;

import React from "react";
import { Box, Flex, Spinner, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { formatMistToSui, GasEstimateResult } from "../utils/gasEstimate";

interface GasEstimatePanelProps {
  estimate: GasEstimateResult | null;
  isEstimating: boolean;
}

const GasEstimatePanel: React.FC<GasEstimatePanelProps> = ({
  estimate,
  isEstimating,
}) => {
  const { t } = useTranslation();

  if (!isEstimating && !estimate) {
    return null;
  }

  if (isEstimating) {
    return (
      <Box
        p={3}
        borderWidth="1px"
        borderRadius="md"
        bg="gray.50"
        borderColor="gray.200"
        w="full"
      >
        <Flex alignItems="center" gap={2}>
          <Spinner size="xs" />
          <Text fontSize="sm" color="gray.600">
            {t("gasEstimate.estimating")}
          </Text>
        </Flex>
      </Box>
    );
  }

  if (!estimate) {
    return null;
  }

  if (!estimate.success) {
    return (
      <Box
        p={3}
        borderWidth="1px"
        borderRadius="md"
        bg="red.50"
        borderColor="red.200"
        w="full"
      >
        <Text fontSize="sm" fontWeight="medium" color="red.700" mb={1}>
          {t("gasEstimate.simulationFailed")}
        </Text>
        {estimate.error && (
          <Text fontSize="xs" color="red.600" wordBreak="break-word">
            {estimate.error}
          </Text>
        )}
      </Box>
    );
  }

  if (!estimate.summary) {
    return null;
  }

  const {
    computationCostMist,
    storageCostMist,
    storageRebateMist,
    netGasMist,
  } = estimate.summary;
  const isNetRebate = netGasMist < BigInt(0);

  return (
    <Box
      p={3}
      borderWidth="1px"
      borderRadius="md"
      bg={isNetRebate ? "green.50" : "blue.50"}
      borderColor={isNetRebate ? "green.200" : "blue.200"}
      w="full"
    >
      <Flex justifyContent="space-between" alignItems="center" mb={1.5}>
        <Text
          fontSize="sm"
          fontWeight="semibold"
          color={isNetRebate ? "green.800" : "blue.800"}
        >
          {isNetRebate
            ? t("gasEstimate.netRebateTitle")
            : t("gasEstimate.estimatedGas")}
        </Text>
        <Text
          fontSize="sm"
          fontWeight="bold"
          fontFamily="mono"
          color={isNetRebate ? "green.700" : "blue.700"}
        >
          {isNetRebate
            ? `+${formatMistToSui(-netGasMist)} SUI`
            : `${formatMistToSui(netGasMist)} SUI`}
        </Text>
      </Flex>
      <Flex
        justifyContent="space-between"
        flexWrap="wrap"
        gap={2}
        fontSize="xs"
        color="gray.600"
      >
        <Text>
          {t("gasEstimate.computation")}: {formatMistToSui(computationCostMist)}{" "}
          SUI
        </Text>
        <Text>
          {t("gasEstimate.storage")}: {formatMistToSui(storageCostMist)} SUI
        </Text>
        <Text>
          {t("gasEstimate.rebate")}: -{formatMistToSui(storageRebateMist)} SUI
        </Text>
      </Flex>
    </Box>
  );
};

export default GasEstimatePanel;

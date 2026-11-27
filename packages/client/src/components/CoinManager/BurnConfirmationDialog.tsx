import React from "react";
import { Button, Dialog, Portal, VStack, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { GasEstimateResult } from "../../utils/gasEstimate";
import GasEstimatePanel from "../GasEstimatePanel";

interface BurnConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isLoading: boolean;
  gasEstimate?: GasEstimateResult | null;
  isEstimatingGas?: boolean;
}

const BurnConfirmationDialog: React.FC<BurnConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isLoading,
  gasEstimate = null,
  isEstimatingGas = false,
}) => {
  const { t } = useTranslation();
  const cancelRef = React.useRef<HTMLButtonElement>(null);

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
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>

            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Text>{message}</Text>
                <GasEstimatePanel
                  estimate={gasEstimate}
                  isEstimating={isEstimatingGas}
                />
              </VStack>
            </Dialog.Body>

            <Dialog.Footer>
              <Button ref={cancelRef} onClick={onClose} disabled={isLoading}>
                {t("common.cancel")}
              </Button>
              <Button
                colorPalette="red"
                onClick={onConfirm}
                ml={3}
                loading={isLoading}
                loadingText={t("coinManager.loading")}
              >
                {t("common.confirm")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default BurnConfirmationDialog;

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import {
  FiCopy,
  FiEye,
  FiEyeOff,
  FiPlay,
  FiShield,
  FiSquare,
  FiTrash2,
} from "react-icons/fi";
import toast from "react-hot-toast";
import {
  formatDurationSeconds,
  MAX_VANITY_TOTAL_LENGTH,
  validateVanityConfig,
} from "./vanityUtils";
import type { VanityWorkerRequest, VanityWorkerResponse } from "./vanityWorker";

interface GeneratedVanityResult {
  id: string;
  address: string;
  secretKey: string;
  prefix: string;
  suffix: string;
  attempts: number;
  elapsedMs: number;
  createdAt: number;
}

const getDefaultWorkerCount = () => {
  if (typeof navigator === "undefined" || !navigator.hardwareConcurrency) {
    return 2;
  }
  return Math.min(Math.max(1, navigator.hardwareConcurrency - 1), 4);
};

const getMaxWorkerCount = () => {
  if (typeof navigator === "undefined" || !navigator.hardwareConcurrency) {
    return 4;
  }
  return Math.min(Math.max(2, navigator.hardwareConcurrency), 8);
};

const VanityAddress: React.FC = () => {
  const { t } = useTranslation();

  const [prefix, setPrefix] = useState<string>("");
  const [suffix, setSuffix] = useState<string>("");
  const [workerCount, setWorkerCount] = useState<number>(getDefaultWorkerCount);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [results, setResults] = useState<GeneratedVanityResult[]>([]);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const workersRef = useRef<Worker[]>([]);
  const startTimeRef = useRef<number>(0);
  const totalAttemptsRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const maxWorkers = useMemo(() => getMaxWorkerCount(), []);
  const validation = useMemo(
    () => validateVanityConfig(prefix, suffix),
    [prefix, suffix],
  );

  const stopWorkers = useCallback(() => {
    workersRef.current.forEach((worker) => worker.terminate());
    workersRef.current = [];
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      stopWorkers();
    };
  }, [stopWorkers]);

  const startGeneration = () => {
    if (!validation.valid) {
      if (validation.error === "emptyPattern") {
        toast.error(t("vanityAddress.error.emptyPattern"));
      } else if (validation.error === "invalidHex") {
        toast.error(t("vanityAddress.error.invalidHex"));
      } else if (validation.error === "tooLong") {
        toast.error(
          t("vanityAddress.error.tooLong", { max: MAX_VANITY_TOTAL_LENGTH }),
        );
      }
      return;
    }

    stopWorkers();
    setAttempts(0);
    setElapsedMs(0);
    totalAttemptsRef.current = 0;
    startTimeRef.current = performance.now();
    setIsRunning(true);

    timerRef.current = window.setInterval(() => {
      setElapsedMs(performance.now() - startTimeRef.current);
    }, 200);

    const request: VanityWorkerRequest = {
      prefix: validation.normalizedPrefix,
      suffix: validation.normalizedSuffix,
    };

    let found = false;

    try {
      for (let i = 0; i < workerCount; i++) {
        const worker = new Worker(
          new URL("./vanityWorker.ts", import.meta.url),
          {
            type: "module",
          },
        );
        workersRef.current.push(worker);

        worker.onmessage = (event: MessageEvent<VanityWorkerResponse>) => {
          const message = event.data;
          totalAttemptsRef.current += message.attemptsDelta;
          setAttempts(totalAttemptsRef.current);

          if (message.type === "found" && !found) {
            found = true;
            const totalElapsed = Math.max(
              1,
              performance.now() - startTimeRef.current,
            );
            setElapsedMs(totalElapsed);
            stopWorkers();

            const newResult: GeneratedVanityResult = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              address: message.address,
              secretKey: message.secretKey,
              prefix: validation.normalizedPrefix,
              suffix: validation.normalizedSuffix,
              attempts: totalAttemptsRef.current,
              elapsedMs: totalElapsed,
              createdAt: Date.now(),
            };

            setResults((prev) => [newResult, ...prev]);
            toast.success(t("vanityAddress.foundToast"));
          }
        };

        worker.onerror = (err) => {
          console.error("Vanity worker error:", err);
          stopWorkers();
          toast.error(t("vanityAddress.error.workerFailed"));
        };

        worker.postMessage(request);
      }
    } catch (error) {
      console.error("Failed to start vanity workers:", error);
      stopWorkers();
      toast.error(t("vanityAddress.error.workerFailed"));
    }
  };

  const toggleRevealSecret = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} ${t("common.copied")}`);
    } catch (error) {
      console.error("Failed to copy value:", error);
      toast.error(t("common.copyFailed"));
    }
  };

  const speedKeysPerSec =
    elapsedMs > 0 ? Math.round((attempts / elapsedMs) * 1000) : 0;
  const estimatedRemainingSec =
    isRunning && speedKeysPerSec > 0 && validation.expectedAttempts > 0
      ? Math.max(0, (validation.expectedAttempts - attempts) / speedKeysPerSec)
      : null;

  const renderHighlightedAddress = (
    address: string,
    matchedPrefix: string,
    matchedSuffix: string,
  ) => {
    const body = address.slice(2);
    const prefixPart = matchedPrefix ? body.slice(0, matchedPrefix.length) : "";
    const suffixStart = matchedSuffix
      ? Math.max(prefixPart.length, body.length - matchedSuffix.length)
      : body.length;
    const middlePart = body.slice(prefixPart.length, suffixStart);
    const suffixPart = body.slice(suffixStart);

    return (
      <Text fontFamily="mono" fontSize="sm" wordBreak="break-all">
        <Text as="span" color="gray.500">
          0x
        </Text>
        {prefixPart && (
          <Text as="span" fontWeight="bold" color="blue.600" bg="blue.50">
            {prefixPart}
          </Text>
        )}
        <Text as="span">{middlePart}</Text>
        {suffixPart && (
          <Text as="span" fontWeight="bold" color="green.600" bg="green.50">
            {suffixPart}
          </Text>
        )}
      </Text>
    );
  };

  return (
    <Container maxW="container.xl" py={8}>
      <Stack gap={6}>
        <Box>
          <Heading as="h1" mb={2}>
            {t("vanityAddress.title")}
          </Heading>
          <Text color="gray.600">{t("vanityAddress.description")}</Text>
        </Box>

        {/* Local-only security notice */}
        <Box
          p={4}
          borderWidth="1px"
          borderRadius="md"
          bg="blue.50"
          borderColor="blue.200"
        >
          <Flex alignItems="flex-start" gap={3}>
            <Icon as={FiShield} color="blue.600" boxSize={5} mt={0.5} />
            <Box>
              <Text fontWeight="semibold" fontSize="sm" color="blue.900">
                {t("vanityAddress.securityTitle")}
              </Text>
              <Text fontSize="xs" color="blue.800" mt={1}>
                {t("vanityAddress.securityDescription")}
              </Text>
            </Box>
          </Flex>
        </Box>

        {/* Configuration panel */}
        <Box p={5} borderWidth="1px" borderRadius="md" bg="white">
          <VStack align="stretch" gap={5}>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1.5}>
                  {t("vanityAddress.prefixLabel")}
                </Text>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="8888"
                  fontFamily="mono"
                  disabled={isRunning}
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                  {t("vanityAddress.hexHint")}
                </Text>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1.5}>
                  {t("vanityAddress.suffixLabel")}
                </Text>
                <Input
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="beef"
                  fontFamily="mono"
                  disabled={isRunning}
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                  {t("vanityAddress.caseInsensitiveHint")}
                </Text>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1.5}>
                  {t("vanityAddress.threadsLabel")} ({workerCount})
                </Text>
                <HStack gap={2} flexWrap="wrap">
                  {Array.from({ length: maxWorkers }, (_, idx) => idx + 1).map(
                    (count) => (
                      <Button
                        key={count}
                        size="sm"
                        variant={workerCount === count ? "solid" : "outline"}
                        colorPalette="blue"
                        disabled={isRunning}
                        onClick={() => setWorkerCount(count)}
                      >
                        {count}
                      </Button>
                    ),
                  )}
                </HStack>
              </Box>
            </SimpleGrid>

            {/* Validation / Difficulty info */}
            {validation.error === "invalidHex" && (
              <Text fontSize="sm" color="red.600">
                {t("vanityAddress.error.invalidHex")}
              </Text>
            )}
            {validation.error === "tooLong" && (
              <Text fontSize="sm" color="red.600">
                {t("vanityAddress.error.tooLong", {
                  max: MAX_VANITY_TOTAL_LENGTH,
                })}
              </Text>
            )}
            {validation.valid && (
              <Box
                p={3}
                bg={validation.totalLength >= 5 ? "orange.50" : "gray.50"}
                borderRadius="md"
                borderWidth="1px"
                borderColor={
                  validation.totalLength >= 5 ? "orange.200" : "gray.200"
                }
              >
                <Flex
                  justifyContent="space-between"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={2}
                >
                  <Text fontSize="sm">
                    {t("vanityAddress.expectedAttempts")}:{" "}
                    <Text as="span" fontWeight="bold" fontFamily="mono">
                      ~{validation.expectedAttempts.toLocaleString()}
                    </Text>
                  </Text>
                  {validation.totalLength >= 5 && (
                    <Badge colorPalette="orange">
                      {t("vanityAddress.highDifficultyWarning")}
                    </Badge>
                  )}
                </Flex>
              </Box>
            )}

            {/* Action buttons */}
            <HStack gap={3}>
              {!isRunning ? (
                <Button
                  colorPalette="blue"
                  size="lg"
                  onClick={startGeneration}
                  disabled={!validation.valid}
                >
                  <Icon as={FiPlay} mr={2} />
                  {t("vanityAddress.start")}
                </Button>
              ) : (
                <Button colorPalette="red" size="lg" onClick={stopWorkers}>
                  <Icon as={FiSquare} mr={2} />
                  {t("vanityAddress.stop")}
                </Button>
              )}
            </HStack>

            {/* Live stats */}
            {(isRunning || attempts > 0) && (
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
                <Box p={3} bg="gray.50" borderRadius="md" borderWidth="1px">
                  <Text fontSize="xs" color="gray.500">
                    {t("vanityAddress.stats.attempts")}
                  </Text>
                  <Text fontSize="lg" fontWeight="bold" fontFamily="mono">
                    {attempts.toLocaleString()}
                  </Text>
                </Box>
                <Box p={3} bg="gray.50" borderRadius="md" borderWidth="1px">
                  <Text fontSize="xs" color="gray.500">
                    {t("vanityAddress.stats.speed")}
                  </Text>
                  <Text fontSize="lg" fontWeight="bold" fontFamily="mono">
                    {speedKeysPerSec.toLocaleString()} /s
                  </Text>
                </Box>
                <Box p={3} bg="gray.50" borderRadius="md" borderWidth="1px">
                  <Text fontSize="xs" color="gray.500">
                    {t("vanityAddress.stats.elapsed")}
                  </Text>
                  <Text fontSize="lg" fontWeight="bold" fontFamily="mono">
                    {formatDurationSeconds(elapsedMs / 1000)}
                  </Text>
                </Box>
                <Box p={3} bg="gray.50" borderRadius="md" borderWidth="1px">
                  <Text fontSize="xs" color="gray.500">
                    {t("vanityAddress.stats.estimatedRemaining")}
                  </Text>
                  <Text fontSize="lg" fontWeight="bold" fontFamily="mono">
                    {estimatedRemainingSec !== null
                      ? formatDurationSeconds(estimatedRemainingSec)
                      : "-"}
                  </Text>
                </Box>
              </SimpleGrid>
            )}
          </VStack>
        </Box>

        {/* Results list */}
        {results.length > 0 && (
          <Box p={5} borderWidth="1px" borderRadius="md" bg="white">
            <Flex justifyContent="space-between" alignItems="center" mb={4}>
              <Heading as="h2" size="md">
                {t("vanityAddress.resultsTitle")} ({results.length})
              </Heading>
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                onClick={() => {
                  setResults([]);
                  setRevealedIds(new Set());
                }}
              >
                <Icon as={FiTrash2} mr={1} />
                {t("vanityAddress.clearResults")}
              </Button>
            </Flex>

            <VStack align="stretch" gap={4}>
              {results.map((item) => {
                const isRevealed = revealedIds.has(item.id);
                return (
                  <Box
                    key={item.id}
                    p={4}
                    borderWidth="1px"
                    borderRadius="md"
                    bg="gray.50"
                  >
                    <VStack align="stretch" gap={3}>
                      <Flex
                        justifyContent="space-between"
                        alignItems="center"
                        flexWrap="wrap"
                        gap={2}
                      >
                        <HStack gap={2}>
                          <Badge colorPalette="green">Ed25519</Badge>
                          <Text fontSize="xs" color="gray.500">
                            {item.attempts.toLocaleString()}{" "}
                            {t("vanityAddress.stats.attempts")} ·{" "}
                            {formatDurationSeconds(item.elapsedMs / 1000)}
                          </Text>
                        </HStack>
                      </Flex>

                      <Box>
                        <Flex
                          justifyContent="space-between"
                          alignItems="center"
                          mb={1}
                        >
                          <Text fontSize="xs" color="gray.500">
                            {t("vanityAddress.addressLabel")}
                          </Text>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              copyValue(
                                item.address,
                                t("vanityAddress.addressLabel"),
                              )
                            }
                          >
                            <Icon as={FiCopy} mr={1} />
                            {t("common.copy")}
                          </Button>
                        </Flex>
                        {renderHighlightedAddress(
                          item.address,
                          item.prefix,
                          item.suffix,
                        )}
                      </Box>

                      <Box>
                        <Flex
                          justifyContent="space-between"
                          alignItems="center"
                          mb={1}
                        >
                          <Text fontSize="xs" color="gray.500">
                            {t("vanityAddress.privateKeyLabel")}
                          </Text>
                          <HStack gap={1}>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => toggleRevealSecret(item.id)}
                            >
                              <Icon as={isRevealed ? FiEyeOff : FiEye} mr={1} />
                              {isRevealed
                                ? t("vanityAddress.hide")
                                : t("vanityAddress.reveal")}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                copyValue(
                                  item.secretKey,
                                  t("vanityAddress.privateKeyLabel"),
                                )
                              }
                            >
                              <Icon as={FiCopy} mr={1} />
                              {t("common.copy")}
                            </Button>
                          </HStack>
                        </Flex>
                        <Text
                          fontFamily="mono"
                          fontSize="xs"
                          wordBreak="break-all"
                          color={isRevealed ? "gray.800" : "gray.400"}
                        >
                          {isRevealed
                            ? item.secretKey
                            : "suiprivkey1••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                        </Text>
                      </Box>
                    </VStack>
                  </Box>
                );
              })}
            </VStack>
          </Box>
        )}
      </Stack>
    </Container>
  );
};

export default VanityAddress;

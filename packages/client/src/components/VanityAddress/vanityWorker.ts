import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { matchesVanityAddress } from "./vanityUtils";

export interface VanityWorkerRequest {
  prefix: string;
  suffix: string;
  batchSize?: number;
}

export type VanityWorkerResponse =
  | {
      type: "progress";
      attemptsDelta: number;
    }
  | {
      type: "found";
      address: string;
      secretKey: string;
      attemptsDelta: number;
    };

const DEFAULT_BATCH_SIZE = 400;

self.onmessage = (event: MessageEvent<VanityWorkerRequest>) => {
  const { prefix, suffix, batchSize = DEFAULT_BATCH_SIZE } = event.data;

  let attemptsSinceReport = 0;

  while (true) {
    const keypair = Ed25519Keypair.generate();
    const address = keypair.toSuiAddress();
    attemptsSinceReport++;

    if (matchesVanityAddress(address, prefix, suffix)) {
      const foundMessage: VanityWorkerResponse = {
        type: "found",
        address,
        secretKey: keypair.getSecretKey(),
        attemptsDelta: attemptsSinceReport,
      };
      self.postMessage(foundMessage);
      return;
    }

    if (attemptsSinceReport >= batchSize) {
      const progressMessage: VanityWorkerResponse = {
        type: "progress",
        attemptsDelta: attemptsSinceReport,
      };
      self.postMessage(progressMessage);
      attemptsSinceReport = 0;
    }
  }
};

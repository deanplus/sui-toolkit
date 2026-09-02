import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";

export const GRPC_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

export type NetworkType = keyof typeof GRPC_URLS;

export const dAppKit = createDAppKit({
  networks: ["mainnet", "testnet", "devnet"],
  defaultNetwork: "mainnet",
  createClient(network) {
    const baseUrl =
      GRPC_URLS[network as keyof typeof GRPC_URLS] || GRPC_URLS.mainnet;
    return new SuiGrpcClient({
      network,
      baseUrl,
    });
  },
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}

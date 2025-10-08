import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  trustWallet,
  braveWallet,
  coinbaseWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { NETWORK_CONFIGS } from "./constants";

const anvilLocal = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [NETWORK_CONFIGS[31337].rpcUrl] },
  },
  testnet: true,
});

const kasplexTestnet = defineChain({
  id: 167012,
  name: "Kasplex Testnet",
  nativeCurrency: { name: "KSPR", symbol: "KSPR", decimals: 18 },
  rpcUrls: {
    default: { http: [NETWORK_CONFIGS[167012].rpcUrl] },
  },
  testnet: true,
});

const chains = [kasplexTestnet, anvilLocal] as const;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        metaMaskWallet,
        trustWallet,
        braveWallet,
        coinbaseWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: "Safe Multisig Manager",
    projectId: "no-walletconnect",
  }
);

export const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: {
    [kasplexTestnet.id]: http(),
    [anvilLocal.id]: http(),
  },
  ssr: false,
});

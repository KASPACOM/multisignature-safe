import { ethers } from "ethers";
import { Network } from "./network-types";

export function createNetworkFromWagmi(
  provider: ethers.BrowserProvider,
  signer: ethers.Signer,
  chainId: number,
  eip1193Provider: any
): Network {
  return {
    id: BigInt(chainId),
    provider,
    signer,
    eip1193Provider,
  };
}

export async function getWagmiProvider(): Promise<ethers.BrowserProvider | null> {
  if (typeof window === "undefined" || !window.ethereum) {
    return null;
  }
  return new ethers.BrowserProvider(window.ethereum);
}

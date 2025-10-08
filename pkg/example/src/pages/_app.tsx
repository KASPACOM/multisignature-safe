import React from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "../lib/wagmi-config";

const queryClient = new QueryClient();

function SafeMultisigApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Safe Multisig Manager</title>
        <meta
          name="description"
          content="Safe multisig wallet management with STS support"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />

        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        <link rel="preconnect" href="https://metamask.io" />
      </Head>

      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider showRecentTransactions={false}>
            <div id="safe-multisig-app">
              <Component {...pageProps} />
            </div>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}

export default SafeMultisigApp;

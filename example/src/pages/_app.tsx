import React from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/globals.css'

function SafeMultisigApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Safe Multisig Manager</title>
        <meta name="description" content="Safe multisig wallet management with STS support" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Meta tags for Web3 */}
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        
        {/* Preload for MetaMask */}
        <link rel="preconnect" href="https://metamask.io" />
      </Head>
      
      {/* Global app wrapper */}
      <div id="safe-multisig-app">
        <Component {...pageProps} />
      </div>
    </>
  )
}

export default SafeMultisigApp
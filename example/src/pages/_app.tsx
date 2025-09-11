import React from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/globals.css'

function SafeMultisigApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Safe Multisig Manager</title>
        <meta name="description" content="Управление Safe мультисиг кошельком с поддержкой STS" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Мета-теги для Web3 */}
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        
        {/* Предзагрузка для MetaMask */}
        <link rel="preconnect" href="https://metamask.io" />
      </Head>
      
      {/* Глобальная обертка приложения */}
      <div id="safe-multisig-app">
        <Component {...pageProps} />
      </div>
      
      {/* Футер с информацией */}
      <footer className="mt-16 py-6 border-t border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-600">
          <p className="mb-2">
            🧩 Safe Multisig Manager - создано с использованием{' '}
            <a 
              href="https://docs.safe.global/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
            >
              Safe Global Protocol Kit
            </a>
          </p>
          <p>
            ⚠️ Это демонстрационное приложение. Проверьте все транзакции перед выполнением.
          </p>
        </div>
      </footer>
    </>
  )
}

export default SafeMultisigApp

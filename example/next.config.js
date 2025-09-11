/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Настройки для работы с Web3 и ethers.js
  webpack: (config, { isServer }) => {
    // Исправление для работы с некоторыми Web3 библиотеками
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }
    }
    
    return config
  },
  
  // Настройки для работы с внешними доменами (если понадобятся)
  images: {
    domains: [
      // Добавьте домены для изображений если нужно
    ],
  },
  
  // Переменные окружения (публичные переменные уже начинаются с NEXT_PUBLIC_)
  env: {
    // Дополнительные переменные окружения можно добавить здесь
  },
  
  // Настройки для TypeScript
  typescript: {
    // Не останавливать сборку на ошибках TypeScript в development
    ignoreBuildErrors: false,
  },
  
  // Настройки ESLint
  eslint: {
    // Не останавливать сборку на предупреждениях ESLint в development
    ignoreDuringBuilds: false,
  },
  
  // Экспериментальные функции
  experimental: {
    // Включите если нужны экспериментальные функции
  },
}

module.exports = nextConfig

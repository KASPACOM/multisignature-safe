/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  webpack: (config, { isServer }) => {
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
  
  images: {
    domains: [
    ],
  },
  
  env: {
  },
  
  typescript: {
    ignoreBuildErrors: false,
  },
  
  eslint: {
    ignoreDuringBuilds: false,
  },
  
  experimental: {
  },
  
  // Enable standalone output for Docker
  output: 'standalone',
}

module.exports = nextConfig

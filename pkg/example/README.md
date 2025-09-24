# Safe Multisig Manager

Next.js web application for creating and managing Safe multisig wallets with Safe Transaction Service integration.

## What is this

- **Safe Creation** - Deploy new multisig wallets
- **Transaction Proposals** - Create and sign transactions
- **Signature Collection** - Offchain signing via STS or local storage  
- **Transaction Execution** - Execute when threshold met
- **Multi-network Support** - Ethereum, L2s, local networks

## Quick Start

```bash
# Install
npm install

# Setup environment (optional - defaults to Anvil chain 31337)
cp env.example .env.local

# Run
npm run dev
```

Open http://localhost:3000

## Full Local Setup

For complete multisig functionality with Safe Transaction Service:

```bash
# 1. Start Anvil
anvil --chain-id 31337

# 2. Deploy contracts (from repo root)
forge script script/DeploySafe.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# 3. Start Safe Transaction Service (from repo root)  
cd pkg/services && docker-compose -f local.yml up -d

# 4. Start frontend
cd pkg/example && npm install && npm run dev
```

## Supported Networks

- **Ethereum** (1), **Optimism** (10), **Arbitrum** (42161), **Polygon** (137), **Base** (8453)
- **Sepolia** (11155111) - testnet
- **Anvil** (31337) - local development

## Project Structure  

```
src/
├── lib/
│   ├── constants.ts      # Network configurations
│   ├── safe-common.ts    # Common utilities  
│   ├── onchain.ts        # Protocol Kit operations
│   └── offchain.ts       # API Kit operations
├── pages/
│   ├── _app.tsx          # Next.js app
│   └── index.tsx         # Main UI
└── styles/
    └── globals.css       # Tailwind styles
```

## Tech Stack

- Next.js 14 + TypeScript
- ethers.js v6  
- @safe-global/protocol-kit + api-kit
- Tailwind CSS

## Links

- [Safe Global Documentation](https://docs.safe.global/)
- [Protocol Kit](https://docs.safe.global/sdk/protocol-kit) 
- [API Kit](https://docs.safe.global/sdk/api-kit)
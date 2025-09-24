# Safe Transaction Service - Deployment

Tool for deploying Safe Transaction Service with custom contracts support.

## What is this

Complete development environment for Safe Protocol:
- Safe Transaction Service (transactions API)
- Foundry contracts (Safe deployment)
- Next.js application (testing interface)
- Docker-compose environment

## Structure

```
safe-forge-deploy/
├── pkg/
│   ├── services/              # Docker configuration
│   │   ├── local.yml         # Docker compose file
│   │   ├── .env.sts          # Environment variables
│   │   ├── nginx/            # Nginx configuration
│   │   └── migration/        # Django fixtures and migrations
│   └── example/              # Next.js application
│       ├── src/              # Testing interface
│       └── package.json      
├── lib/                      # Foundry libraries
│   ├── safe-smart-account/   # Safe contracts
│   └── openzeppelin-contracts/
├── script/                   # Foundry scripts
│   └── DeploySafe.s.sol      # Contract deployment
└── test/                     # Foundry tests
```

## Local Usage

```bash
# 0. Start forge anvil
anvil

# 1. Start services
cd pkg/services && docker-compose -f local.yml up -d

# 2. Start frontend
cd pkg/example && npm install && npm run dev

# 3. Deploy contracts (optional)
forge script script/DeploySafe.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

## Services

- **API**: http://localhost:8000 - Safe Transaction Service
- **Admin**: http://localhost:8000/admin - Django admin (admin/admin123)
- **Frontend**: http://localhost:3000 - Test application
- **Flower**: http://localhost:5555 - Celery monitoring

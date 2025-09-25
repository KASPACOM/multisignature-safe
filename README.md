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
anvil --host 0.0.0.0

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

## Production Launch

### Deployment

Use `prod.yml` for production deployment:

```bash
# 1. Copy environment variables template
cp pkg/services/env.example.prod .env

# 2. Edit .env with production values
# 3. Deploy using prod.yml
cd pkg/services && docker-compose -f prod.yml up -d
```

### Required Environment Variables

Configure these secrets in your `.env` file:

#### **DJANGO_SECRET_KEY** (Required)

Strong secret key for Django cryptographic operations (sessions, CSRF, etc.)

```bash
DJANGO_SECRET_KEY=your-very-strong-random-key-at-least-50-chars
```

#### **DJANGO_ALLOWED_HOSTS** (Required)

Comma-separated list of allowed hostnames for Django security

```bash
DJANGO_ALLOWED_HOSTS=yourdomain.com,api.yourdomain.com
```

#### **CSRF_TRUSTED_ORIGINS** (Required)

Trusted origins for CSRF protection (must include https://)

```bash
CSRF_TRUSTED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
```

#### **POSTGRES_USER** (Required)

PostgreSQL database username

```bash
POSTGRES_USER=postgres
```

#### **POSTGRES_PASSWORD** (Required)

Strong password for PostgreSQL database

```bash
POSTGRES_PASSWORD=your-strong-db-password
```

#### **POSTGRES_DB** (Required)

PostgreSQL database name

```bash
POSTGRES_DB=safe_transaction_service
```

#### **ETHEREUM_NODE_URL** (Required)

HTTP/HTTPS URL to Ethereum-compatible RPC node for blockchain access

```bash
ETHEREUM_NODE_URL=https://your-ethereum-node-url
```

### Django Administration

Access Django admin interface for configuration:

- **URL**: `https://yourdomain.com/admin/`
- **Documentation**: [Django Admin Documentation](https://docs.djangoproject.com/en/stable/ref/contrib/admin/)
- **Safe Transaction Service**: [Official Repository](https://github.com/safe-global/safe-transaction-service)

Create superuser after deployment:

```bash
docker compose -f pkg/services/prod.yml exec -it web python manage.py createsuperuser
```

### Required Endpoints

For frontend integration, expose these endpoints:

- **API Base**: `/api/` - Main Safe Transaction Service API
- **Admin Panel**: `/admin/` - Django administration interface
- **Health Check**: `/check/` - Service health status

### Contract Configuration

#### Master Copies (One-time setup)

Add Safe contract addresses in Django Admin → **Safe Master Copies**:

- **SafeL2 singleton**: `0x5a2b478CBd6Ad0ac28A3eBAF7D9A782a4a50AdEE`

#### Proxy Factories (One-time setup)

Add factory addresses in Django Admin → **Safe Proxy Factories**:

- **SafeProxyFactory**: `0x04Ac3D0eB50762b12715ED745a5cbe20679fB8d8`

#### Contract ABIs for Transaction Decoding

To enable transaction data decoding and convenient function selection when creating proposals, add contract ABIs in Django Admin → **Contract ABIs**:

**Purpose**:

- Decode transaction data for better UX
- Enable function selection in Safe interface
- Display human-readable transaction information

**How to add**:

1. Go to Django Admin → **Contract ABIs**
2. Add contract address and corresponding ABI (JSON format)
3. Service will automatically decode transactions to/from these contracts

**Auto-detection**:

- Verified contracts on block explorers are automatically detected
- Manual addition required for unverified or custom contracts
- Use `/api/v1/data-decoder/` endpoint to test decoding

**Examples of contracts to add**:

- DeFi protocols (Uniswap, Aave, etc.)
- DAO governance contracts
- Custom application contracts
- Token contracts with custom functions

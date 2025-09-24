# 🚀 Safe Transaction Service - Migration Tools

Tools for migration and configuration of Safe Transaction Service with custom contracts support.

## 📁 Folder Contents

```
migration/
├── setup_safe_migration.sh      # 🎯 Main complete migration script
├── contracts-config/           # 📋 Contracts configuration
│   ├── config.json             # Main configuration (admin, API, database)
│   ├── safe-contracts.json     # Safe Proxy Factories & Master Copies
│   ├── contracts.json          # Custom contracts list
│   └── abis/                   # ABI files (JSON)
└── README.md                   # This file - complete documentation
```

## ⚡ Quick Start

### 1. Setup Configuration

```bash
cd migration/

# First, configure main settings (admin, API, database)
vim contracts-config/config.json

# Configure Safe contracts (Proxy Factories & Master Copies)
vim contracts-config/safe-contracts.json

# Configure custom contracts
vim contracts-config/contracts.json
```

### 2. Run Migration

```bash
# Complete migration with all steps
./setup_safe_migration.sh

# Check configuration is valid
./setup_safe_migration.sh --dry-run
```

### 3. View Configuration

```bash
# View active contracts
cat contracts-config/contracts.json | jq '.contracts[] | select(.enabled == true)'

# View Safe contracts
cat contracts-config/safe-contracts.json | jq
```

## 🔗 How Contract ↔ ABI Linking Works

In Safe Transaction Service every contract **MUST** be linked with ABI:

```python
# Django models
class ContractAbi(models.Model):
    abi = models.JSONField()          # ABI array
    description = models.TextField()   # Description
    relevance = models.IntegerField()  # Relevance

class Contract(models.Model):
    address = models.CharField()       # Contract address
    name = models.CharField()          # Name
    contract_abi = models.ForeignKey(ContractAbi)  # 🔗 ABI LINK
    trusted_for_delegate_call = models.BooleanField()
```

**Creation process:**

1. `ContractAbi` is created with JSON ABI array
2. `Contract` is created with reference to `ContractAbi`
3. API automatically returns contract together with ABI

## 📋 Configuration Files

### config.json format:

```json
{
  "admin": {
    "username": "admin",
    "email": "admin@example.com",
    "password": "your_secure_password"
  },
  "api": {
    "host": "127.0.0.1",
    "port": 8000,
    "flower_port": 5555,
    "base_url": "http://127.0.0.1:8000",
    "flower_url": "http://127.0.0.1:5555",
    "admin_url": "http://127.0.0.1:8000/admin/"
  },
  "container": {
    "name": "safe-forge-deploy-web-1"
  },
  "database": {
    "host": "db",
    "user": "postgres",
    "name": "default"
  },
  "paths": {
    "migration_dir": "/app/migration",
    "contracts_config_dir": "contracts-config",
    "safe_contracts_file": "contracts-config/safe-contracts.json",
    "custom_contracts_file": "contracts-config/contracts.json"
  },
  "defaults": {
    "safe_version": "1.4.1",
    "safe_l2": true,
    "abi_relevance": 100
  }
}
```

### safe-contracts.json format:

```json
{
  "proxy_factories": [
    {
      "name": "Safe Proxy Factory",
      "address": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      "description": "Safe Proxy Factory v1.4.1",
      "initial_block": 0,
      "tx_block_number": 2,
      "enabled": true,
      "trusted": true
    }
  ],
  "master_copies": [
    {
      "name": "Safe Master Copy 1.4.1",
      "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      "description": "Safe Master Copy implementation v1.4.1",
      "initial_block": 0,
      "tx_block_number": 2,
      "version": "1.4.1",
      "enabled": true,
      "trusted": true,
      "l2": true
    }
  ]
}
```

### contracts.json format:

```json
{
  "contracts": [
    {
      "name": "ERC20Mintable",
      "display_name": "ERC20 Mintable",
      "address": "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
      "abi_file": "abis/ERC20Mintable.json",
      "description": "ERC20 Mintable contract",
      "relevance": 100,
      "trusted_for_delegate_call": false,
      "enabled": true
    }
  ]
}
```

### Adding new contract:

1. **Create ABI file:**

   ```bash
   echo '[{"type":"function","name":"balanceOf"...}]' > contracts-config/abis/NewToken.json
   ```

2. **Add to contracts.json:**

   ```json
   {
     "name": "New Token",
     "address": "0x...",
     "abi_file": "abis/NewToken.json",
     "enabled": true
   }
   ```

3. **Run migration:**
   ```bash
   ./setup_safe_migration.sh
   ```

## 🎯 What setup_safe_migration.sh does

**Complete automated migration:**

1. ✅ **Configuration loading and validation** (from `config.json`)
   - Load all settings from main configuration
   - Validate required fields are present
   - Check admin password is not default
2. ✅ Services check (PostgreSQL, Redis)
3. ✅ Django migrations (`python manage.py migrate`)
4. ✅ Superuser creation (using config credentials)
5. ✅ Service setup (`python manage.py setup_service`)
6. ✅ **Safe contracts setup** (from `safe-contracts.json`)
   - Proxy Factories from configuration
   - Safe Master Copies from configuration
   - Contract ↔ ContractAbi links creation
7. ✅ **Custom contracts setup** (from `contracts.json`)
   - Load ABI files
   - Create ContractAbi entries
   - Create Contract entries with ABI links
8. ✅ Chain ID verification
9. ✅ Health checks (using config endpoints)

## 🔧 Migration Options

```bash
# Complete migration
./setup_safe_migration.sh

# Force update everything
./setup_safe_migration.sh --force-all

# Only contracts (skip superuser)
./setup_safe_migration.sh --skip-superuser

# Only Safe contracts (skip custom contracts)
./setup_safe_migration.sh --skip-custom-contracts

# Only custom contracts (skip Safe contracts)
./setup_safe_migration.sh --skip-contracts

# Show commands without execution
./setup_safe_migration.sh --dry-run

# Custom main configuration
./setup_safe_migration.sh --config my-config.json

# Custom contracts configuration files
./setup_safe_migration.sh --safe-config my-safe.json --custom-config my-contracts.json

# Help
./setup_safe_migration.sh --help
```

## 🌐 After Migration

**Available services:**

- **API:** http://localhost:8000/api/v1/
- **Admin:** http://localhost:8000/admin/
- **Contracts:** http://localhost:8000/api/v1/contracts/

**Result verification:**

```bash
# Contracts list
curl http://localhost:8000/api/v1/contracts/ | jq

# Specific contract with ABI
curl http://localhost:8000/api/v1/contracts/0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6/ | jq '.contractAbi'

# Service information
curl http://localhost:8000/api/v1/about/ | jq
```

## ⚙️ Configuration Management

All settings are managed through JSON configuration files:

### Required Configuration Files:

1. **`config.json`** - Main configuration (REQUIRED)

   - Admin user credentials
   - API endpoints and ports
   - Database settings
   - Container names and paths

2. **`safe-contracts.json`** - Safe contracts configuration

   - Proxy Factories addresses and settings
   - Master Copies addresses and versions

3. **`contracts.json`** - Custom contracts configuration
   - Contract addresses and ABI file paths
   - Contract metadata and settings

### Configuration Validation:

- All fields in `config.json` are required
- Admin password cannot be default `"your_password_here"`
- Script validates configuration before execution

### Environment Variables (Optional):

```bash
# RPC connection (if needed for custom setup)
ETHEREUM_NODE_URL=http://host.docker.internal:8545

# Django settings override (optional)
DJANGO_SUPERUSER_USERNAME=admin  # Overrides config.json
DJANGO_SUPERUSER_EMAIL=admin@example.com
DJANGO_SUPERUSER_PASSWORD=secure_password
```

## 🔍 Troubleshooting

### Container not found

```bash
docker-compose ps                    # Check status
docker-compose up -d                 # Start containers
```

TODO: Use docker compose

### Database connection error

```bash
docker exec -it safe-forge-deploy-web-1 pg_isready -h db
```

### Contracts not loading

```bash
# Force contracts loading
./setup_safe_migration.sh --force-all

TODO: Use docker compose

# Check RPC connection
docker exec -it safe-forge-deploy-web-1 python manage.py shell -c "
import requests
print(requests.get('http://host.docker.internal:8545', json={'method': 'eth_chainId', 'params': [], 'id': 1}).json())
"
```

### Configuration file not found

TODO: Just check

```bash
# Check main configuration exists
ls -la contracts-config/config.json

# Check all configuration files exist
ls -la contracts-config/
ls -la contracts-config/abis/
```

### Configuration validation errors

```bash
# Check configuration fields
./setup_safe_migration.sh --dry-run

# Validate JSON syntax
jq . contracts-config/config.json
jq . contracts-config/safe-contracts.json
jq . contracts-config/contracts.json
```

### Default password error

```
Please change the default admin password in configuration!
```

**Solution**: Edit `config.json` and change `"password": "your_password_here"` to a secure password

## 🏗️ Django Models (for understanding linking)

### Contract model

```python
class Contract(models.Model):
    address = models.CharField(max_length=42, unique=True)
    name = models.CharField(max_length=200)
    display_name = models.CharField(max_length=200)
    contract_abi = models.ForeignKey(ContractAbi, on_delete=models.CASCADE)
    trusted_for_delegate_call = models.BooleanField(default=False)
```

### ContractAbi model

```python
class ContractAbi(models.Model):
    abi = models.JSONField()
    description = models.TextField(blank=True)
    relevance = models.IntegerField(default=100)
```

## ❌ Common Errors

### 1. Contract without ABI

```
django.db.IntegrityError: Contract must have contract_abi
```

**Solution**: Always create ContractAbi before Contract

### 2. Invalid ABI format

```
ValidationError: Invalid ABI format
```

**Solution**: Check that ABI is a JSON array with correct structure

### 3. Container not running

```
Error: No such container: safe-forge-deploy-web-1
```

**Solution**: Run `docker-compose up -d` before migration

### 4. Main configuration file not found

```
Configuration file contracts-config/config.json not found!
```

**Solution**: Create and fill `contracts-config/config.json` with all required settings

### 5. Missing configuration fields

```
Missing fields: ADMIN_PASSWORD API_HOST CONTAINER_NAME
```

**Solution**: Check that all required fields are present in `config.json`

### 6. Default password not changed

```
Please change the default admin password in configuration!
```

**Solution**: Set a secure password in `config.json` instead of `"your_password_here"`

## 🔄 ABI File Formats

Two formats are supported:

**Format 1: Direct ABI array**

```json
[
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [...],
    "outputs": [...]
  }
]
```

**Format 2: Object with abi field**

```json
{
  "abi": [
    {
      "type": "function",
      "name": "balanceOf",
      "inputs": [...],
      "outputs": [...]
    }
  ]
}
```

## 📚 Documentation

- **[../README.md](../README.md)** - Project overview
- **[../example/README.md](../example/README.md)** - Frontend application
- **[Safe Documentation](https://docs.safe.global/)** - Official documentation

---

🎉 **Done!** All migration tools are organized and ready to use.

TODO: Можно сжать в общем

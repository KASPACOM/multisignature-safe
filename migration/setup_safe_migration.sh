#!/bin/bash

# =============================================================================
# Safe Transaction Service - Complete Migration Script
# =============================================================================
# 
# This script performs complete Safe Transaction Service migration including:
# 1. Creating superuser
# 2. Setting up Proxy Factories  
# 3. Safe master copies
# 4. Contract ABIs
# 5. Contracts
#
# IMPORTANT: Components 2-5 are tightly coupled in Safe Transaction Service:
# - Each Contract MUST have an associated ContractABI
# - Proxy Factories and Safe Master Copies are registered as Contracts with ABI
# - setup_safe_contracts command configures ALL these components simultaneously
#
# Usage:
#   ./setup_safe_migration.sh [OPTIONS]
#
# Options:
#   --force-all                  Force execute all steps
#   --force-superuser            Force recreate superuser
#   --force-contracts            Force update contracts
#   --force-custom-contracts     Force update custom contracts
#   --skip-superuser             Skip superuser creation
#   --skip-contracts             Skip contracts setup
#   --skip-custom-contracts      Skip custom contracts setup
#   --safe-config FILE           Path to Safe contracts configuration file
#   --custom-config FILE         Path to custom contracts configuration file
#   --dry-run                    Only show commands without execution
#   --help                       Show help
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default parameters
FORCE_ALL=false
FORCE_SUPERUSER=false
FORCE_CONTRACTS=false
FORCE_CUSTOM_CONTRACTS=false
SKIP_SUPERUSER=false
SKIP_CONTRACTS=false
SKIP_CUSTOM_CONTRACTS=false
DRY_RUN=false

# Path to main configuration file
CONFIG_FILE="contracts-config/config.json"

# Configuration variables (will be loaded from config file)
SAFE_CONFIG_FILE=""
CUSTOM_CONTRACTS_CONFIG=""
CONTAINER_NAME=""
API_HOST=""
API_PORT=""
API_BASE_URL=""
FLOWER_URL=""
ADMIN_URL=""
DB_HOST=""
DB_USER=""
DB_NAME=""
ADMIN_USERNAME=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
MIGRATION_DIR=""
CONTRACTS_CONFIG_DIR=""

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌${NC} $1"
}

# Load configuration from JSON file
load_config() {
    local script_dir="$(dirname "$0")"
    local config_path="$script_dir/$CONFIG_FILE"
    
    if [ ! -f "$config_path" ]; then
        log_error "Configuration file $config_path not found!"
        log ""
        log "Required configuration fields:"
        log "  • admin: username, email, password"
        log "  • api: host, port, base_url, flower_url, admin_url"  
        log "  • container: name"
        log "  • database: host, user, name"
        log "  • paths: migration_dir, contracts_config_dir, safe_contracts_file, custom_contracts_file"
        log ""
        log "Please create the configuration file: $config_path"
        log "All fields are required and must be properly filled."
        exit 1
    fi
    
    # Load configuration using jq or Python
    if command -v jq &> /dev/null; then
        # Use jq if available
        SAFE_CONFIG_FILE=$(jq -r '.paths.safe_contracts_file' "$config_path")
        CUSTOM_CONTRACTS_CONFIG=$(jq -r '.paths.custom_contracts_file' "$config_path")
        CONTAINER_NAME=$(jq -r '.container.name' "$config_path")
        API_HOST=$(jq -r '.api.host' "$config_path")
        API_PORT=$(jq -r '.api.port' "$config_path")
        API_BASE_URL=$(jq -r '.api.base_url' "$config_path")
        FLOWER_URL=$(jq -r '.api.flower_url' "$config_path")
        ADMIN_URL=$(jq -r '.api.admin_url' "$config_path")
        DB_HOST=$(jq -r '.database.host' "$config_path")
        DB_USER=$(jq -r '.database.user' "$config_path")
        DB_NAME=$(jq -r '.database.name' "$config_path")
        ADMIN_USERNAME=$(jq -r '.admin.username' "$config_path")
        ADMIN_EMAIL=$(jq -r '.admin.email' "$config_path")
        ADMIN_PASSWORD=$(jq -r '.admin.password' "$config_path")
        MIGRATION_DIR=$(jq -r '.paths.migration_dir' "$config_path")
        CONTRACTS_CONFIG_DIR=$(jq -r '.paths.contracts_config_dir' "$config_path")
    else
        # Fallback to Python if jq is not available
        local python_script="
import json
with open('$config_path', 'r') as f: c = json.load(f)
for k,v in [('SAFE_CONFIG_FILE',c['paths']['safe_contracts_file']),('CUSTOM_CONTRACTS_CONFIG',c['paths']['custom_contracts_file']),('CONTAINER_NAME',c['container']['name']),('API_HOST',c['api']['host']),('API_PORT',c['api']['port']),('API_BASE_URL',c['api']['base_url']),('FLOWER_URL',c['api']['flower_url']),('ADMIN_URL',c['api']['admin_url']),('DB_HOST',c['database']['host']),('DB_USER',c['database']['user']),('DB_NAME',c['database']['name']),('ADMIN_USERNAME',c['admin']['username']),('ADMIN_EMAIL',c['admin']['email']),('ADMIN_PASSWORD',c['admin']['password']),('MIGRATION_DIR',c['paths']['migration_dir']),('CONTRACTS_CONFIG_DIR',c['paths']['contracts_config_dir'])]: print(f'{k}={v}')
"
        
        local config_vars=$(python3 -c "$python_script" 2>/dev/null)
        if [ $? -eq 0 ]; then
            eval "$config_vars"
        else
            log_error "Failed to load configuration with Python"
            exit 1
        fi
    fi
    
    # Validate required configuration fields
    validate_config
    
}

# Validate configuration variables
validate_config() {
    local missing_fields=()
    
    for var in SAFE_CONFIG_FILE CUSTOM_CONTRACTS_CONFIG CONTAINER_NAME API_HOST API_PORT API_BASE_URL FLOWER_URL ADMIN_URL DB_HOST DB_USER DB_NAME ADMIN_USERNAME ADMIN_EMAIL ADMIN_PASSWORD MIGRATION_DIR CONTRACTS_CONFIG_DIR; do
        local val=$(eval echo \$$var)
        
        # Check if value is empty or null
        if [ -z "$val" ] || [ "$val" = "null" ]; then
            missing_fields+=("$var")
        fi
    done
    
    if [ ${#missing_fields[@]} -gt 0 ]; then
        log_error "Missing fields: ${missing_fields[*]}"
        exit 1
    fi
    
    if [ "$ADMIN_PASSWORD" = "your_password_here" ]; then
        log_error "Change default password!"
        exit 1
    fi
}


# Function to execute commands in container
run_in_container() {
    local cmd="$1"
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] docker exec $CONTAINER_NAME bash -c \"$cmd\""
    else
        docker exec $CONTAINER_NAME bash -c "$cmd"
    fi
}

# Function to check container status
check_container() {
    log "Checking Safe Transaction Service container status..."
    
    if ! docker ps --format 'table {{.Names}}' | grep -q "$CONTAINER_NAME"; then
        log_error "Container $CONTAINER_NAME is not running!"
        log "Please start first: docker-compose up -d"
        exit 1
    fi
    
    log_success "Container $CONTAINER_NAME is running"
}

# Function to wait for services readiness
wait_for_services() {
    log "Waiting for services to be ready..."
    
    # Wait for PostgreSQL
    run_in_container "until pg_isready -h $DB_HOST -U $DB_USER; do sleep 1; done"
    log_success "PostgreSQL is ready"
    
    # Redis is checked automatically by Django/Celery on connection
    log_success "Redis skipped (checked automatically)"
}

# 1. Execute Django migrations
run_migrations() {
    log "=== 1. EXECUTE DJANGO MIGRATIONS ==="
    run_in_container "python manage.py migrate --noinput"
    log_success "Migrations completed"
}

# 2. Create superuser
create_superuser() {
    if [ "$SKIP_SUPERUSER" = true ]; then
        log_warning "Skipping superuser creation"
        return
    fi
    
    log "=== 2. CREATE SUPERUSER ==="
    
    if [ "$FORCE_SUPERUSER" = false ]; then
        # Check superuser existence
        log "Checking superuser existence..."
        local check_result=$(run_in_container "python manage.py shell -c \"from django.contrib.auth import get_user_model; User = get_user_model(); print('EXISTS' if User.objects.filter(is_superuser=True).exists() else 'NOT_EXISTS')\"" 2>/dev/null | grep -o "EXISTS\|NOT_EXISTS" | tail -1)
        
        if [ "$check_result" = "EXISTS" ]; then
            log_success "Superuser already exists"
            return
        elif [ "$check_result" = "NOT_EXISTS" ]; then
            log "Superuser not found, creating..."
        else
            log_warning "Could not check superuser existence, forcing creation..."
        fi
    fi
    
    # Create superuser
    log "Creating superuser..."
    run_in_container "python manage.py shell -c \"
from django.contrib.auth import get_user_model
import os

User = get_user_model()
username = os.environ.get('DJANGO_SUPERUSER_USERNAME', '$ADMIN_USERNAME')
email = os.environ.get('DJANGO_SUPERUSER_EMAIL', '$ADMIN_EMAIL')
password = os.environ.get('DJANGO_SUPERUSER_PASSWORD', '$ADMIN_PASSWORD')

if User.objects.filter(username=username).exists():
    user = User.objects.get(username=username)
    user.is_superuser = True
    user.is_staff = True
    user.save()
    print('✅ Superuser {} updated'.format(username))
else:
    User.objects.create_superuser(username, email, password)
    print('✅ Superuser {} created'.format(username))
\""
    log_success "Superuser configured"
}

# 3. Setup service
setup_service() {
    log "=== 3. SETUP SERVICE ==="
    run_in_container "python manage.py setup_service"
    log_success "Service configured"
}

# 4. Setup Safe contracts (including ABI)
setup_safe_contracts() {
    if [ "$SKIP_CONTRACTS" = true ]; then
        log_warning "Skipping Safe contracts setup"
        return
    fi
    
    log "=== 4. SETUP SAFE CONTRACTS AND ABI ==="
    log "Configuration file: $SAFE_CONFIG_FILE"
    
    # Check configuration file existence on host
    local script_dir="$(dirname "$0")"
    local config_path="$script_dir/$SAFE_CONFIG_FILE"
    
    if [ ! -f "$config_path" ]; then
        log_error "Configuration file $config_path not found on host!"
        exit 1
    fi
    
    # Copy files to container
    docker cp "$script_dir/" $CONTAINER_NAME:/app/migration/
    
    local force_update=""
    if [ "$FORCE_CONTRACTS" = true ] || [ "$FORCE_ALL" = true ]; then
        force_update="True"
    else
        force_update="False"
    fi
    
    # Setup Safe contracts from JSON configuration
    log "Setting up Safe contracts from configuration..."
    run_in_container "python manage.py shell -c \"
import json
from safe_transaction_service.history.models import ProxyFactory, SafeMasterCopy
from django.db import transaction

force_update = $force_update

# Load configuration
config_path = '$MIGRATION_DIR/$SAFE_CONFIG_FILE'
with open(config_path, 'r') as f:
    config = json.load(f)

def validate_address(address):
    address = address.strip().lower()
    if not address.startswith('0x'):
        address = '0x' + address
    if len(address) != 42:
        raise ValueError('Invalid address length')
    return address

# Setup Proxy Factories
proxy_factories = config.get('proxy_factories', [])

for factory in proxy_factories:
    address = validate_address(factory['address'])
    name = factory['name']
    
    with transaction.atomic():
        proxy_factory, created = ProxyFactory.objects.update_or_create(
            address=address,
            defaults={
                'initial_block_number': factory.get('initial_block', 0),
                'tx_block_number': factory.get('tx_block_number')
            }
        )
        
        status = '✅ Created' if created else ('✅ Updated' if force_update else 'ℹ️ Exists')
        print('🏭 {} Proxy Factory: {} ({})'.format(status, name, address))

# Setup Safe Master Copies
master_copies = config.get('master_copies', [])

for master_copy in master_copies:
    address = validate_address(master_copy['address'])
    name = master_copy['name']
    version = master_copy['version']  # Required field
    l2 = master_copy['l2']  # Required field
    
    with transaction.atomic():
        safe_master_copy, created = SafeMasterCopy.objects.update_or_create(
            address=address,
            defaults={
                'initial_block_number': master_copy.get('initial_block', 0),
                'tx_block_number': master_copy.get('tx_block_number'),
                'version': version,
                'l2': l2
            }
        )
        
        status = '✅ Created' if created else ('✅ Updated' if force_update else 'ℹ️ Exists')
        l2_marker = 'L2' if l2 else 'L1'
        print('📋 {} Safe Master Copy: {} v{} ({}) ({})'.format(status, name, version, l2_marker, address))
\""
    
    # Fallback to standard command
    log "Running additional setup_safe_contracts command..."
    local std_force_flag=""
    if [ "$FORCE_CONTRACTS" = true ] || [ "$FORCE_ALL" = true ]; then
        std_force_flag="--force-update-contracts"
    fi
    run_in_container "python manage.py setup_safe_contracts $std_force_flag"
    
    log_success "Safe contracts and ABI configured"
    
    # Check that contracts are correctly configured
    log "Verifying Safe contracts setup..."
    run_in_container "python manage.py shell -c \"
from safe_transaction_service.history.models import ProxyFactory, SafeMasterCopy
from safe_transaction_service.contracts.models import Contract, ContractAbi
proxy_count = ProxyFactory.objects.count()
master_copy_count = SafeMasterCopy.objects.count()
contracts_count = Contract.objects.count()
abi_count = ContractAbi.objects.count()
contracts_with_abi = Contract.objects.filter(contract_abi__isnull=False).count()
print('✅ Proxy Factories: {}'.format(proxy_count))
print('✅ Safe Master Copies: {}'.format(master_copy_count))
print('✅ Contracts: {}, ABI: {}, Linked: {}'.format(contracts_count, abi_count, contracts_with_abi))
\""
    log_success "Safe contracts verification completed"
}

# 5. Setup custom contracts with ABI
setup_custom_contracts() {
    if [ "$SKIP_CUSTOM_CONTRACTS" = true ]; then
        log_warning "Skipping custom contracts setup"
        return
    fi
    
    log "=== 5. SETUP CUSTOM CONTRACTS AND ABI ==="
    log "Configuration file: $CUSTOM_CONTRACTS_CONFIG"
    
    # Check configuration file existence on host
    local script_dir="$(dirname "$0")"
    local config_path="$script_dir/$CUSTOM_CONTRACTS_CONFIG"
    
    if [ ! -f "$config_path" ]; then
        log_warning "Configuration file $config_path not found on host, skipping custom contracts"
        return
    fi
    
    # Files already copied in setup_safe_contracts, check they exist
    if ! run_in_container "test -f $MIGRATION_DIR/$CUSTOM_CONTRACTS_CONFIG"; then
        log_warning "Configuration file not found in container, skipping custom contracts"
        return
    fi
    
    local force_update=""
    if [ "$FORCE_CUSTOM_CONTRACTS" = true ] || [ "$FORCE_ALL" = true ]; then
        force_update="True"
    else
        force_update="False"
    fi
    
    # Add all custom contracts from configuration
    log "Adding custom contracts from configuration..."
    run_in_container "python manage.py shell -c \"
import json
from safe_transaction_service.contracts.models import Contract, ContractAbi
from django.db import transaction

force_update = $force_update

def validate_address(address):
    address = address.strip().lower()
    if not address.startswith('0x'):
        address = '0x' + address
    if len(address) != 42:
        raise ValueError('Invalid address length')
    return address

def load_abi_from_file(abi_file):
    # Path relative to migration folder in container
    abi_path = f'$MIGRATION_DIR/$CONTRACTS_CONFIG_DIR/{abi_file}'
    
    try:
        with open(abi_path, 'r') as f:
            abi_data = json.load(f)
            
        # If file contains object with 'abi' field
        if isinstance(abi_data, dict) and 'abi' in abi_data:
            return abi_data['abi']
        
        # If file contains ABI array directly
        if isinstance(abi_data, list):
            return abi_data
            
        raise ValueError('File does not contain valid ABI')
        
    except FileNotFoundError:
        print('❌ File {} not found'.format(abi_path))
        return None
    except json.JSONDecodeError as e:
        print('❌ JSON parsing error: {}'.format(e))
        return None
    except Exception as e:
        print('❌ ABI loading error: {}'.format(e))
        return None

# Load configuration
config_path = '$MIGRATION_DIR/$CUSTOM_CONTRACTS_CONFIG'
with open(config_path, 'r') as f:
    config = json.load(f)

contracts = config.get('contracts', [])

success_count = 0
error_count = 0

for contract in contracts:
    try:
        # Address validation
        address = validate_address(contract['address'])
        name = contract['name']
        display_name = contract.get('display_name') or name
        
        # Load ABI
        abi_file = contract.get('abi_file')
        if not abi_file:
            print('⚠️ {} - skipped (no abi_file)'.format(name))
            error_count += 1
            continue
            
        abi = load_abi_from_file(abi_file)
        if not abi:
            error_count += 1
            continue
            
        with transaction.atomic():
            # Create or update ABI
            contract_abi, abi_created = ContractAbi.objects.get_or_create(
                abi=abi,
                defaults={
                    'description': contract.get('description', ''),
                    'relevance': contract.get('relevance', 100)
                }
            )
            
            # Create or update contract
            contract_obj, contract_created = Contract.objects.update_or_create(
                address=address,
                defaults={
                    'name': name,
                    'display_name': display_name,
                    'contract_abi': contract_abi,
                    'trusted_for_delegate_call': contract.get('trusted_for_delegate_call', False)
                }
            )
            
            status = '✅ Created' if contract_created else '✅ Updated'
            print('⚙️ {} contract: {} ({})'.format(status, name, address))
            
        success_count += 1
        
    except Exception as e:
        print('❌ Error: {} - {}'.format(contract.get('name', 'Unknown'), e))
        error_count += 1

print('🎯 Completed: {} successful, {} errors'.format(success_count, error_count))
\""
    
    log_success "Custom contracts and ABI configured"
    
    # Check that custom contracts were added
    log "Verifying custom contracts addition..."
    run_in_container "python manage.py shell -c \"
from safe_transaction_service.contracts.models import Contract, ContractAbi
custom_contracts_count = Contract.objects.exclude(
    address__in=[
        contract.address for contract in Contract.objects.filter(
            name__icontains='Safe'
        )
    ]
).count()
total_contracts = Contract.objects.count()
total_abi = ContractAbi.objects.count()
contracts_with_abi = Contract.objects.filter(contract_abi__isnull=False).count()
print('✅ Custom contracts: {}'.format(custom_contracts_count))
print('✅ Total contracts: {}'.format(total_contracts))
print('✅ Total ABI: {}'.format(total_abi))
print('✅ Contracts with ABI: {}'.format(contracts_with_abi))
\""
    log_success "Custom contracts verification completed"
}

# 6. Check Chain ID
check_chain_id() {
    log "=== 6. CHECK CHAIN ID ==="
    run_in_container "python manage.py check_chainid_matches"
    log_success "Chain ID verified"
}

# 7. Additional checks
run_health_checks() {
    log "=== 7. HEALTH CHECKS ==="
    
    # Check API
    log "Checking API availability..."
    if curl -f -s $API_BASE_URL/api/v1/about/ > /dev/null; then
        log_success "API available"
    else
        log_warning "API unavailable (possibly still loading)"
    fi
    
    # Check database
    log "Checking database connection..."
    run_in_container "python manage.py check --database $DB_NAME"
    log_success "Database is OK"
}

# Show help
show_help() {
    cat << EOF
Safe Transaction Service - Complete Migration Script

Usage:
  ./setup_safe_migration.sh [OPTIONS]

Options:
  --force-all                  Force execute all steps
  --force-superuser            Force recreate superuser
  --force-contracts            Force update contracts
  --force-custom-contracts     Force update custom contracts
  --skip-superuser             Skip superuser creation
  --skip-contracts             Skip contracts setup
  --skip-custom-contracts      Skip custom contracts setup
  --config FILE                Path to main configuration file (default: contracts-config/config.json)
  --safe-config FILE           Path to Safe contracts configuration file
  --custom-config FILE         Path to custom contracts configuration file
  --dry-run                    Only show commands without execution
  --help                       Show this help

Configuration:
  Uses contracts-config/config.json for all settings including:
  - Admin user credentials
  - API endpoints and ports  
  - Database configuration
  - Container names and paths

Examples:
  # Complete migration (all steps)
  ./setup_safe_migration.sh
  
  # Force migration of all components
  ./setup_safe_migration.sh --force-all
  
  # Only Safe contracts (skip superuser and custom)
  ./setup_safe_migration.sh --skip-superuser --skip-custom-contracts
  
  # Only custom contracts (skip superuser and Safe)
  ./setup_safe_migration.sh --skip-superuser --skip-contracts
  
  # With custom main config
  ./setup_safe_migration.sh --config my-config.json
  
  # With custom contracts configs
  ./setup_safe_migration.sh --safe-config my-safe.json --custom-config my-contracts.json
  
  # Dry run (show commands)
  ./setup_safe_migration.sh --dry-run

EOF
}

# Process command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force-all)
            FORCE_ALL=true
            FORCE_SUPERUSER=true
            FORCE_CONTRACTS=true
            FORCE_CUSTOM_CONTRACTS=true
            shift
            ;;
        --force-superuser)
            FORCE_SUPERUSER=true
            shift
            ;;
        --force-contracts)
            FORCE_CONTRACTS=true
            shift
            ;;
        --force-custom-contracts)
            FORCE_CUSTOM_CONTRACTS=true
            shift
            ;;
        --skip-superuser)
            SKIP_SUPERUSER=true
            shift
            ;;
        --skip-contracts)
            SKIP_CONTRACTS=true
            shift
            ;;
        --skip-custom-contracts)
            SKIP_CUSTOM_CONTRACTS=true
            shift
            ;;
        --config)
            if [[ -n "${2-}" && ! "${2-}" =~ ^-- ]]; then
                CONFIG_FILE="$2"
                log "Main configuration file: $CONFIG_FILE"
                shift 2
            else
                log_error "Option --config requires file path"
                exit 1
            fi
            ;;
        --safe-config)
            if [[ -n "${2-}" && ! "${2-}" =~ ^-- ]]; then
                SAFE_CONFIG_FILE="$2"
                log "Safe contracts configuration file: $SAFE_CONFIG_FILE"
                shift 2
            else
                log_error "Option --safe-config requires file path"
                exit 1
            fi
            ;;
        --custom-config)
            if [[ -n "${2-}" && ! "${2-}" =~ ^-- ]]; then
                CUSTOM_CONTRACTS_CONFIG="$2"
                log "Custom contracts configuration file: $CUSTOM_CONTRACTS_CONFIG"
                shift 2
            else
                log_error "Option --custom-config requires file path"
                exit 1
            fi
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution function
main() {
    log "🚀 Starting complete Safe Transaction Service migration"
    log "================================================="
    
    # Load configuration
    load_config
    
    # Display configuration
    log "Configuration:"
    log "  - Force all: $FORCE_ALL"
    log "  - Force superuser: $FORCE_SUPERUSER"  
    log "  - Force contracts: $FORCE_CONTRACTS"
    log "  - Force custom contracts: $FORCE_CUSTOM_CONTRACTS"
    log "  - Skip superuser: $SKIP_SUPERUSER"
    log "  - Skip contracts: $SKIP_CONTRACTS"
    log "  - Skip custom contracts: $SKIP_CUSTOM_CONTRACTS"
    log "  - Safe contracts config: $SAFE_CONFIG_FILE"
    log "  - Custom contracts config: $CUSTOM_CONTRACTS_CONFIG"
    log "  - Dry run: $DRY_RUN"
    log "  - Container: $CONTAINER_NAME"
    echo ""
    
    if [ "$DRY_RUN" = false ]; then
        check_container
        wait_for_services
    fi
    
    # Execute migration steps
    run_migrations
    create_superuser  
    setup_service
    setup_safe_contracts
    setup_custom_contracts
    check_chain_id
    
    if [ "$DRY_RUN" = false ]; then
        run_health_checks
    fi
    
    log_success "🎉 Safe Transaction Service migration completed successfully!"
    log ""
    log "Available services:"
    log "  🌐 Safe Transaction Service API: $API_BASE_URL"
    log "  🌸 Flower (Celery monitoring): $FLOWER_URL"  
    log "  📊 Admin Panel: $ADMIN_URL"
    log ""
    log "To access admin panel use:"
    log "  Username: $ADMIN_USERNAME"
    log "  Password: $ADMIN_PASSWORD"
}

# Handle interrupt signals
trap 'log_error "Migration interrupted by user"; exit 1' INT TERM

# Run main function
main

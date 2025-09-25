# Safe Transaction Service - Migration Fixtures

This directory contains Django fixtures and migration files for initializing the Safe Transaction Service with pre-configured data.

## Fixtures

### `safe_full_data.json`
Complete dataset including all configured models, contracts, schedules, and admin users.

## Generating Fixtures

To generate fixtures from your Django admin panel, use the following command:

```bash
# Export all data from key applications
python manage.py dumpdata \
  auth.user \
  sites \
  contracts \
  history.proxyfactory \
  history.safemastercopy \
  history.indexingstatus \
  history.chain \
  django_celery_beat \
  --indent 2 \
  --output migration/fixtures/safe_full_data.json
```

## Usage

The fixtures are automatically loaded during Docker container startup via the data migration `0097_load_initial_safe_data.py`.

## Data Migration

The `data-migrations/0097_load_initial_safe_data.py` file automatically loads the fixture data when running Django migrations. This ensures a clean, pre-configured Safe Transaction Service instance on first startup.

## Notes

- Fixtures include pre-configured Celery Beat tasks for blockchain indexing
- Contract ABIs for ERC20Mintable and WKAS tokens are included  
- Admin user credentials should be changed after initial setup
- Remove or modify session data if importing between different environments

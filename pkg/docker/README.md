# Docker Build Configurations

Dockerfiles for building services via ArgoCD.

## Build Contexts

| Service | Build Context | Dockerfile |
|---------|--------------|------------|
| example | `pkg/example/` | `pkg/docker/example.dockerfile` |
| nginx | `pkg/services/nginx/` | `pkg/docker/nginx.dockerfile` |
| web | N/A | `pkg/docker/web.dockerfile` |
| indexer-worker | N/A | `pkg/docker/indexer-worker.dockerfile` |
| contracts-tokens-worker | N/A | `pkg/docker/contracts-tokens-worker.dockerfile` |
| scheduler | N/A | `pkg/docker/scheduler.dockerfile` |

## Services Using Base Images

These services use base images without custom Dockerfiles:

- **redis:** `redis:alpine`
- **rabbitmq:** `rabbitmq:alpine`
- **db:** `postgres:16-alpine`

## Environment Variables for DevOps

All hardcoded values from `prod.yml` are baked into Dockerfiles.

### Required Runtime Variables (via Kubernetes ConfigMap/Secret):

**Database (postgres):**
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

**Web + Workers:**
- `DJANGO_SECRET_KEY`
- `DATABASE_URL` (format: `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}`)
- `ETHEREUM_NODE_URL`
- `DJANGO_ALLOWED_HOSTS`
- `CSRF_TRUSTED_ORIGINS`

### Ports Exposed:

- nginx: 8000
- redis: 6379
- rabbitmq: 5672
- db: 5432
- web: 8888

### Dependencies:

- web depends on: db, redis (healthy)
- workers depend on: web (healthy), rabbitmq (healthy)


FROM safeglobal/safe-transaction-service:latest

ENV RUN_MIGRATIONS=0 \
    PYTHONPATH=/app/ \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    DEBUG=0 \
    ETH_L2_NETWORK=1 \
    REDIS_URL=redis://redis:6379/0 \
    CELERY_BROKER_URL=amqp://guest:guest@rabbitmq/ \
    WORKER_QUEUES="default,indexing,processing"

CMD ["docker/web/celery/scheduler/run.sh"]


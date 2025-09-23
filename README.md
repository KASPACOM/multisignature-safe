# 🛡️ Safe Transaction Service - Deployment & Migration

Полный набор инструментов для развертывания и настройки Safe Transaction Service с поддержкой кастомных контрактов и ABI.

## 🚀 Быстрый старт

```bash
# 1. Запустить Safe Transaction Service
docker-compose up -d

# 2. Выполнить полную миграцию
./setup_migration.sh

# 3. Проверить результат
curl http://localhost:8000/api/v1/contracts/ | jq
```

## 📁 Структура проекта

```
safe-forge-deploy/
├── docker-compose.yml           # Docker Compose конфигурация
├── nginx.conf                   # Nginx конфигурация
├── env-example                  # Пример переменных окружения
├── setup_migration.sh           # 🔗 Ссылка на migration/setup_safe_migration.sh
│
├── migration/                   # 🗂️ Инструменты миграции
│   ├── README.md               # Полная документация по миграции
│   ├── setup_safe_migration.sh # Основной скрипт полной миграции
│   ├── add_custom_contract.py  # Добавление кастомных контрактов
│   └── contracts-config/      # Конфигурация кастомных контрактов
│       ├── contracts.json     # Список контрактов для добавления
│       └── abis/             # ABI файлы контрактов
│
├── example/                     # 🌐 Frontend приложение для тестирования
│   ├── src/                    # Next.js исходники
│   ├── package.json           # NPM зависимости
│   └── README.md              # Документация по frontend
│
├── lib/                         # 📚 Foundry библиотеки
│   ├── forge-std/             # Forge стандартная библиотека
│   ├── openzeppelin-contracts/ # OpenZeppelin контракты
│   └── safe-smart-account/    # Safe смарт-контракты
│
├── script/                      # 🔧 Foundry скрипты развертывания
│   └── DeploySafe.s.sol       # Скрипт развертывания Safe контрактов
│
└── test/                        # 🧪 Foundry тесты
    ├── Safe.t.sol             # Тесты Safe контрактов
    └── ...
```

## 🎯 Основные компоненты

### 1. **Safe Transaction Service** (Docker)
- **PostgreSQL** - база данных транзакций
- **Redis** - кэширование и очереди Celery
- **Safe Transaction Service** - основной API
- **Nginx** - reverse proxy

### 2. **Migration Tools** (Python/Bash)
- **setup_safe_migration.sh** - полная автоматизированная миграция
- **add_custom_contract.py** - управление кастомными контрактами
- **contracts-config/** - структурированная конфигурация ABI

### 3. **Smart Contracts** (Solidity/Foundry)
- **Safe Proxy Factory** - фабрика Safe кошельков
- **Safe Master Copy** - эталонная реализация Safe
- **Custom Contracts** - пользовательские контракты

### 4. **Frontend App** (Next.js/TypeScript)  
- **Contract Selector** - выбор контрактов из API
- **Function Forms** - интерфейс для вызова функций
- **Safe Management** - создание и управление Safe

## ⚡ Миграция в одну команду

```bash
# Полная миграция Safe Transaction Service
./setup_migration.sh

# С дополнительными опциями
./setup_migration.sh --force-all      # Принудительное обновление
./setup_migration.sh --dry-run        # Показать команды без выполнения
./setup_migration.sh --skip-contracts # Только суперпользователь
```

**Что включает миграция:**
- ✅ Создание суперпользователя Django
- ✅ Настройка Proxy Factories + ABI  
- ✅ Настройка Safe Master Copies + ABI
- ✅ Создание Contract ↔ ContractABI связей
- ✅ Проверки состояния системы

## 🔧 Управление контрактами

### Просмотр доступных контрактов
```bash
cd migration/
python add_custom_contract.py --config contracts-config/contracts.json --list
```

### Добавление всех контрактов из конфигурации
```bash
cd migration/  
python add_custom_contract.py --config contracts-config/contracts.json --batch
```

### Добавление конкретного контракта
```bash
cd migration/
python add_custom_contract.py --config contracts-config/contracts.json --name "WKAS Token"
```

### Ручное добавление контракта
```bash
cd migration/
python add_custom_contract.py \
  --address 0x1234567890123456789012345678901234567890 \
  --name "MyContract" \
  --abi-file contracts-config/abis/MyContract.json
```

## 🌐 Доступные сервисы

После успешной миграции доступны:

| Сервис | URL | Описание |
|--------|-----|----------|
| **Safe Transaction Service API** | http://localhost:8000 | Основной API |
| **Admin Panel** | http://localhost:8000/admin/ | Django админка |
| **Flower (Celery)** | http://localhost:5555 | Мониторинг Celery |
| **Frontend App** | http://localhost:3000 | Тестовое приложение |

**Логин для админки:**
- Пользователь: `admin` (или `$DJANGO_SUPERUSER_USERNAME`)
- Пароль: `admin123` (или `$DJANGO_SUPERUSER_PASSWORD`)

## 🔍 API Примеры

```bash
# Информация о сервисе
curl http://localhost:8000/api/v1/about/ | jq

# Список всех контрактов с ABI
curl http://localhost:8000/api/v1/contracts/ | jq

# Конкретный контракт
curl http://localhost:8000/api/v1/contracts/0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67/ | jq

# Создание Safe кошелька
curl -X POST http://localhost:8000/api/v1/safes/ \
  -H "Content-Type: application/json" \
  -d '{"owners":["0x..."],"threshold":1}' | jq
```

## ⚙️ Переменные окружения

Создайте файл `.env.sts` на основе `env-example`:

```bash
# Копировать пример
cp env-example .env.sts

# Основные настройки
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@example.com  
DJANGO_SUPERUSER_PASSWORD=admin123
ETHEREUM_NODE_URL=http://host.docker.internal:8545
ENABLE_SAFE_SETUP_CONTRACTS=1
```

## 🏗️ Разработка

### Добавление нового контракта в конфигурацию

1. **Создать ABI файл:**
   ```bash
   echo '[{"type":"function",...}]' > migration/contracts-config/abis/NewContract.json
   ```

2. **Обновить конфигурацию:**
   ```json
   // migration/contracts-config/contracts.json
   {
     "contracts": [
       {
         "name": "New Contract",
         "address": "0x...",
         "abi_file": "abis/NewContract.json",
         "enabled": true
       }
     ]
   }
   ```

3. **Добавить контракт:**
   ```bash
   cd migration/
   python add_custom_contract.py --config contracts-config/contracts.json --name "New Contract"
   ```

### Тестирование с локальной сетью

```bash
# 1. Запустить Anvil (локальная сеть)
anvil --chain-id 31337

# 2. Развернуть Safe контракты
forge script script/DeploySafe.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# 3. Обновить .env.sts с адресами контрактов
# 4. Запустить миграцию
./setup_migration.sh
```

## 🔄 Обновления и откаты

### Обновление контрактов
```bash
./setup_migration.sh --force-contracts
```

### Откат миграций Django
```bash
docker exec -it safe-forge-deploy-web-1 python manage.py migrate contracts 0001
```

### Очистка всех контрактов
```bash
docker exec -it safe-forge-deploy-web-1 python manage.py shell -c "
from contracts.models import Contract, ContractAbi
Contract.objects.all().delete()
ContractAbi.objects.all().delete()
"
```

## 📚 Документация

- **[Migration README](migration/README.md)** - Полная документация по инструментам миграции
- **[Example App README](example/README.md)** - Документация по frontend приложению
- **[Safe Documentation](https://docs.safe.global/)** - Официальная документация Safe

## 🆘 Troubleshooting

### Контейнеры не запускаются
```bash
docker-compose down && docker-compose up -d
docker-compose logs -f web
```

### API недоступен
```bash
# Проверить состояние контейнеров
docker-compose ps

# Проверить логи
docker-compose logs web
```

### Контракты не загружаются
```bash
# Принудительная загрузка
./setup_migration.sh --force-contracts

# Проверить переменные окружения
docker exec -it safe-forge-deploy-web-1 env | grep ETHEREUM
```

### Ошибки Django
```bash
# Войти в контейнер
docker exec -it safe-forge-deploy-web-1 bash

# Проверить миграции
python manage.py showmigrations

# Применить миграции
python manage.py migrate
```

## 🤝 Вклад в проект

1. Fork репозиторий
2. Создайте feature branch (`git checkout -b feature/new-feature`)
3. Commit изменения (`git commit -am 'Add new feature'`)
4. Push в branch (`git push origin feature/new-feature`) 
5. Создайте Pull Request

---

## 🎉 Готово!

После выполнения `./setup_migration.sh` у вас будет полностью настроенный Safe Transaction Service с поддержкой кастомных контрактов и ABI.

Для детального изучения инструментов миграции смотрите **[migration/README.md](migration/README.md)**.
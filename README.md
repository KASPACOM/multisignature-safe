# Safe Smart Account - Foundry Deployment

Альтернативный способ деплоя контрактов Safe Smart Account с использованием **Foundry** вместо Hardhat.

## ✅ Преимущества Foundry

- **Автоматический linking библиотек** - `MarshalLib` корректно линкуется с `ExtensibleFallbackHandler`
- **Быстрая компиляция** - Rust-based компилятор намного быстрее
- **Простые Solidity скрипты** - деплой на чистом Solidity без JavaScript
- **Встроенная симуляция** - проверка деплоя без трат газа

## 🚀 Быстрый старт

### 1. Подготовка окружения

```bash
# Убедиться что Foundry установлен
forge --version

# Клонировать проект (если нужно)
cd /Users/pavel/Desktop/work/KaspaCom/safe-forge-deploy
```

### 2. Настройка переменных

```bash
# Скопировать и настроить .env файл
cp env-example .env

# Добавить свой приватный ключ
echo "PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE" > .env
```

### 3. Компиляция

```bash
forge build
```

### 4. Симуляция деплоя

```bash
# Тестовый запуск (без реального деплоя)
forge script script/DeploySafe.s.sol
```

### 5. Реальный деплой

```bash
# Деплой на локальную сеть (Anvil/Hardhat)
forge script script/DeploySafe.s.sol --rpc-url http://localhost:8545 --broadcast

# Деплой на тестовую сеть
forge script script/DeploySafe.s.sol --rpc-url $RPC_URL --broadcast --verify
```

## 📋 Деплоеные контракты

Скрипт деплоит все основные контракты Safe в правильном порядке:

### Библиотеки:
- `CreateCall` - Создание новых контрактов через Safe
- `MultiSend` - Батчинг транзакций  
- `MultiSendCallOnly` - Батчинг только call'ов
- `SignMessageLib` - Подпись сообщений
- `SafeToL2Setup` - Миграция на L2

### Основные контракты:
- `Safe` - Основной контракт мультисиг кошелька
- `SafeL2` - L2-оптимизированная версия
- `SafeProxyFactory` - Фабрика для создания Safe прокси

### Хендлеры:
- `TokenCallbackHandler` - Обработка токенов
- `CompatibilityFallbackHandler` - Обратная совместимость
- `ExtensibleFallbackHandler` - Расширяемый хендлер (**работает корректно!**)

### Дополнительно:
- `SimulateTxAccessor` - Симуляция транзакций
- `SafeMigration` - Миграция версий Safe

## 🔧 Конфигурация

**foundry.toml** настроен на:
- Solidity 0.7.6 (как в оригинальном проекте)
- Оптимизация с 200 runs
- EVM версия London
- Автоматический linking библиотек

## 📝 Примечания

- **MarshalLib**: Автоматически линкуется с `ExtensibleFallbackHandler` (решена проблема из Hardhat)
- **Приватный ключ**: Должен содержать префикс `0x`
- **Gas cost**: ~9.9M gas для полного деплоя всех контрактов
- **Безопасность**: Не используйте тестовые ключи в продакшн

## ⚡ Сравнение с Hardhat

| Аспект | Foundry ✅ | Hardhat ❌ |
|--------|-----------|-----------|
| Компиляция | ~2s | ~30s |
| Library linking | Автоматически | Ошибки |
| ExtensibleFallbackHandler | Работает | Не деплоится |
| Симуляция | Встроенная | Требует настройки |
| Скрипты | Solidity | TypeScript |

---

**Готово к использованию!** 🎉

Foundry успешно решил проблемы с linking библиотек, которые возникали в Hardhat.
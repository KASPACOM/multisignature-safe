# 🚀 План рефакторинга Safe архитектуры

## 🎯 Цель
Упростить архитектуру до 2 основных классов без локального хранилища:
- `@onchain.ts` - все блокчейн операции 
- `@offchain.ts` - получение пропозалов из STS

## 📋 Текущее состояние
```
safe-manager.ts (1120 строк) ← УДАЛИТЬ
safe-common.ts (150 строк)   ← ЧАСТИЧНО УДАЛИТЬ 
safe-onchain.ts (992 строки) ← РАСШИРИТЬ
safe-offchain.ts (937 строк) ← УПРОСТИТЬ
LocalTransactionStorage       ← УДАЛИТЬ
```

## 🎯 Целевая архитектура

### `SafeOnChain` (onchain.ts) - Главный класс
**Ответственности:**
1. ✅ Создание и подключение к Safe
2. ✅ Генерация хэша операций 
3. ✅ Approve hash в блокчейне
4. ✅ Execute транзакций
5. 🆕 Высокоуровневый API для фронтенда (из SafeManager)

### `SafeOffChain` (offchain.ts) - Вспомогательный класс  
**Ответственности:**
1. ✅ Получение пропозалов пользователя из STS
2. ✅ Фильтрация и статистика пропозалов
3. ❌ ~~LocalTransactionStorage~~ - убираем
4. ❌ ~~Кэширование транзакций~~ - убираем

### `safe-common.ts` - Только утилиты
**Оставляем только:**
- Подключение к кошельку
- Форматирование адресов/значений
- Сетевые конфигурации

## 📝 Пошаговый план

### Шаг 1: Анализ зависимостей ✅
- [x] Найти все места использования SafeManager
- [x] Найти все места использования LocalTransactionStorage
- [x] Проанализировать какие методы перенести в SafeOnChain

### Шаг 2: Расширение SafeOnChain ✅
- [x] Перенести высокоуровневые методы из SafeManager
- [x] Добавить методы для полного workflow: propose → approve → execute
- [x] Убрать зависимости от LocalTransactionStorage

### Шаг 3: Упрощение SafeOffChain ✅
- [x] Убрать LocalTransactionStorage
- [x] Оставить только STS и пропозалы пользователей
- [x] Упростить fallback логику

### Шаг 4: Обновление фронтенда ✅
- [x] Заменить SafeManager на прямое использование SafeOnChain
- [x] Обновить компонент UserProposals
- [x] Протестировать весь workflow

### Шаг 5: Очистка ✅
- [x] Удалить safe-manager.ts
- [x] Удалить неиспользуемые части safe-common.ts
- [x] Удалить LocalTransactionStorage

## 🔄 Workflow после рефакторинга

```typescript
// 1. Создание/подключение Safe
const safeOnChain = new SafeOnChain(signer)
await safeOnChain.createSafe(form) // или connectToSafe(form)

// 2. Генерация хэша операции
const result = await safeOnChain.createTransactionHash(params)

// 3. Approve hash в блокчейне
await safeOnChain.approveTransactionHash(result.safeTxHash)

// 4. Execute транзакции
await safeOnChain.executeWithApprovals(result.safeTxHash)

// Параллельно: получение пропозалов пользователя
const safeOffChain = new SafeOffChain()
const proposals = await safeOffChain.getUserProposals({userAddress})
```

## ⚠️ Риски и вопросы

1. **Что делать с кэшированием транзакций?**
   - Approve hash в блокчейне заменяет LocalStorage
   - Нужно ли временное кэширование в памяти?

2. **Как обрабатывать fallback при недоступности STS?**
   - Только для чтения пропозалов
   - Основной workflow через блокчейн

3. **Обратная совместимость**
   - Фронтенд нужно будет переписать
   - Все существующие ссылки на SafeManager

## 🚀 Преимущества после рефакторинга

✅ **Простая архитектура:** только 2 основных класса  
✅ **Меньше кода:** убираем ~1200 строк  
✅ **Надёжность:** approve hash в блокчейне вместо localStorage  
✅ **Производительность:** меньше слоёв абстракции  
✅ **Поддержка:** проще понимать и изменять  

---

## 📋 Status: ✅ РЕФАКТОРИНГ ЗАВЕРШЕН УСПЕШНО!

**🎉 РЕЗУЛЬТАТ:**
- ❌ **50 ошибок компиляции** → ✅ **0 ошибок**
- ❌ **3 файла (safe-manager.ts + LocalStorage)** → ✅ **2 файла (SafeOnChain + SafeOffChain)**
- ❌ **Сложная архитектура с localStorage** → ✅ **Простой workflow с approve hash**
- ❌ **100+ использований LocalStorage** → ✅ **Полностью удален**

**🚀 НОВЫЙ WORKFLOW:**
1. `SafeOnChain` - создание/подключение + генерация хэша + approve + execute
2. `SafeOffChain` - получение пропозалов пользователя из STS
3. Простой API без localStorage зависимостей

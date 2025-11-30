# ООО "СистемаКотроля"
Микросервисная структура по управлению задачами по работе со строительными объектами

---

## Переменные окружения (.env)

Создайте файл `.env` в корне проекта со значениями по вашему окружению.

Пример содержимого:
```
NODE_ENV=development
LOG_LEVEL=info
PINO_PRETTY=false

# Безопасный ключ для подписи JWT (обязательно заменить на уникальный)
JWT_SECRET=change-me-please

# Базовые URL сервисов
USERS_SERVICE_URL=http://service_users:8000
ORDERS_SERVICE_URL=http://service_orders:8000

# Разрешённый origin для CORS (для разработки можно оставить *)
CORS_ORIGIN=*
```

Для production:
- `NODE_ENV=production`
- `PINO_PRETTY=false`
- `LOG_LEVEL=info` или `warn`
- Установите собственный сильный `JWT_SECRET`

### Тестовый администратор

По умолчанию создается тестовый администратор:
- Email: `admin@example.com`
- Password: `admin123`

---

## Запуск проекта

### Использование Docker Compose

```bash
docker-compose up --build
```

Сервисы будут доступны:
- API Gateway: http://localhost:8000
- Users Service: http://service_users:8000 (внутри Docker сети)
- Orders Service: http://service_orders:8000 (внутри Docker сети)

---

## Документация API

OpenAPI спецификация находится в `docs/swagger.yaml`

---

## Тестирование

Запуск тестов  

Для запуска unit тестов:

```bash
# User Service
cd service_users
npm install
npm test

# Order Service
cd service_orders
npm install
npm test
```

### Реализованные тесты

**User Service:**
- Успешная регистрация с валидными полями - ожидаем статус успех и созданный идентификатор
- Повторная регистрация с той же почтой - ожидаем контролируемую ошибку
- Вход с правильными данными - ожидаем выдачу токена
- Доступ к защищённому пути без токена - ожидаем отказ

**Order Service:**
- Создание заказа для авторизованного пользователя - ожидаем успех и статус создан
- Получение своего заказа - ожидаем успех
- Список своих заказов с пагинацией - ожидаем корректные поля и навигацию по страницам
- Попытка обновить чужой заказ - ожидаем отказ
- Отмена собственного заказа - ожидаем статус отменён и отсутствие побочных эффектов

---

# Архитектура проекта

Структура модулей

Все три сервиса разделены на логические модули для улучшения поддерживаемости и читаемости кода.

### User Service (`service_users/`)

```
service_users/
├── config/
│   ├── index.js          # Конфигурация (PORT, JWT_SECRET, etc.)
│   └── logger.js         # Настройка логгера pino
├── database/
│   └── users.js          # Работа с in-memory БД пользователей
├── middleware/
│   ├── auth.js           # Middleware для авторизации и проверки прав
│   └── errorHandler.js   # Обработка ошибок и 404
├── models/
│   └── validation.js     # Zod схемы валидации
├── routes/
│   ├── authRoutes.js     # Роуты для регистрации и входа
│   └── userRoutes.js     # Роуты для работы с пользователями
├── services/
│   ├── authService.js    # Бизнес-логика аутентификации
│   └── userService.js    # Бизнес-логика работы с пользователями
├── utils/
│   └── response.js       # Утилиты для формирования ответов
└── index.js              # Точка входа приложения
```

### Order Service (`service_orders/`)

```
service_orders/
├── config/
│   ├── index.js          # Конфигурация
│   └── logger.js         # Настройка логгера
├── database/
│   └── orders.js         # Работа с in-memory БД заказов
├── middleware/
│   ├── auth.js           # Middleware для авторизации
│   └── errorHandler.js   # Обработка ошибок
├── models/
│   ├── constants.js      # Константы (статусы заказов)
│   └── validation.js     # Zod схемы валидации
├── routes/
│   └── orderRoutes.js    # Роуты для работы с заказами
├── services/
│   ├── orderService.js   # Бизнес-логика заказов
│   └── userService.js    # Проверка существования пользователя
├── utils/
│   ├── events.js         # Доменные события
│   └── response.js       # Утилиты для ответов
└── index.js              # Точка входа
```

### API Gateway (`api_gateway/`)

```
api_gateway/
├── config/
│   ├── index.js          # Конфигурация
│   └── logger.js         # Настройка логгера
├── middleware/
│   ├── auth.js           # JWT валидация и публичные роуты
│   ├── errorHandler.js   # Обработка ошибок
│   ├── rateLimit.js      # Rate limiting
│   └── requestId.js      # X-Request-ID middleware
├── utils/
│   └── proxy.js          # Конфигурация прокси
└── index.js              # Точка входа
```
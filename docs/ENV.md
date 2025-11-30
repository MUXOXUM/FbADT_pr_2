# Переменные окружения (.env)

Создайте файл `.env` в корне проекта (он уже добавлен в `.gitignore`, поэтому не попадёт в репозиторий) со значениями по вашему окружению.

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


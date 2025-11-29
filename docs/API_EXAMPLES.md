# Примеры использования API

## Регистрация пользователя

```bash
curl -X POST http://localhost:8000/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "Иван Иванов"
  }'
```

## Вход в систему

```bash
curl -X POST http://localhost:8000/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

Ответ:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "Иван Иванов",
      "roles": ["user"]
    }
  }
}
```

## Получение текущего профиля

```bash
curl -X GET http://localhost:8000/v1/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Обновление профиля

```bash
curl -X PUT http://localhost:8000/v1/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Новое имя"
  }'
```

## Создание заказа

```bash
curl -X POST http://localhost:8000/v1/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "product": "Товар 1",
        "quantity": 2,
        "price": 100.50
      },
      {
        "product": "Товар 2",
        "quantity": 1,
        "price": 250.00
      }
    ]
  }'
```

## Получение списка заказов

```bash
curl -X GET "http://localhost:8000/v1/orders?page=1&limit=10&status=created" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Получение заказа по ID

```bash
curl -X GET http://localhost:8000/v1/orders/ORDER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Обновление статуса заказа (только для администраторов)

```bash
curl -X PATCH http://localhost:8000/v1/orders/ORDER_ID/status \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_work"
  }'
```

## Отмена заказа

```bash
curl -X POST http://localhost:8000/v1/orders/ORDER_ID/cancel \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Список пользователей (только для администраторов)

```bash
curl -X GET "http://localhost:8000/v1/users?page=1&limit=10&role=user" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

## Тестовый администратор

По умолчанию создается тестовый администратор:
- Email: `admin@example.com`
- Password: `admin123`
- Роли: `["admin", "user"]`


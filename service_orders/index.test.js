const request = require('supertest');
const axios = require('axios');
const { app } = require('./index');
const { clearDatabase, createOrder, getOrderById } = require('./database/orders');
const { v4: uuidv4 } = require('uuid');

// Mock axios for user verification
jest.mock('axios');

describe('Order Service Tests', () => {
  let userId1, userId2;

  beforeEach(() => {
    // Clear database before each test
    clearDatabase();
    
    // Generate test user IDs
    userId1 = uuidv4();
    userId2 = uuidv4();

    // Mock successful user verification by default
    axios.get.mockResolvedValue({
      status: 200,
      data: { success: true, data: { id: userId1 } }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /v1/orders', () => {
    test('Создание заказа для авторизованного пользователя - ожидаем успех и статус создан', async () => {
      const orderData = {
        items: [
          {
            product: 'Товар 1',
            quantity: 2,
            price: 100.50
          },
          {
            product: 'Товар 2',
            quantity: 1,
            price: 250.00
          }
        ]
      };

      const response = await request(app)
        .post('/v1/orders')
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.userId).toBe(userId1);
      expect(response.body.data.status).toBe('created');
      expect(response.body.data.items).toEqual(orderData.items);
      expect(response.body.data.total).toBe(451.00); // 2 * 100.50 + 1 * 250.00
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.updatedAt).toBeDefined();
    });

    test('Создание заказа без авторизации - ожидаем ошибку', async () => {
      const orderData = {
        items: [
          {
            product: 'Товар 1',
            quantity: 1,
            price: 100.50
          }
        ]
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(orderData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    test('Создание заказа с невалидными данными - ожидаем ошибку валидации', async () => {
      const orderData = {
        items: []
      };

      const response = await request(app)
        .post('/v1/orders')
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .send(orderData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Создание заказа для несуществующего пользователя - ожидаем ошибку', async () => {
      axios.get.mockResolvedValue({
        status: 404
      });

      const orderData = {
        items: [
          {
            product: 'Товар 1',
            quantity: 1,
            price: 100.50
          }
        ]
      };

      const response = await request(app)
        .post('/v1/orders')
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .send(orderData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('GET /v1/orders/:orderId', () => {
    test('Получение своего заказа - ожидаем успех', async () => {
      // Создаем заказ
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [
          {
            product: 'Товар 1',
            quantity: 2,
            price: 100.50
          }
        ],
        status: 'created',
        total: 201.00,
        createdAt: now,
        updatedAt: now
      });

      const response = await request(app)
        .get(`/v1/orders/${orderId}`)
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(orderId);
      expect(response.body.data.userId).toBe(userId1);
      expect(response.body.data.status).toBe('created');
    });

    test('Получение несуществующего заказа - ожидаем ошибку', async () => {
      const nonExistentOrderId = uuidv4();

      const response = await request(app)
        .get(`/v1/orders/${nonExistentOrderId}`)
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    test('Попытка получить чужой заказ - ожидаем отказ', async () => {
      // Создаем заказ для userId1
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [
          {
            product: 'Товар 1',
            quantity: 1,
            price: 100.50
          }
        ],
        status: 'created',
        total: 100.50,
        createdAt: now,
        updatedAt: now
      });

      // Пытаемся получить заказ от имени userId2
      const response = await request(app)
        .get(`/v1/orders/${orderId}`)
        .set('X-User-Id', userId2)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /v1/orders', () => {
    beforeEach(() => {
      // Создаем несколько заказов для тестов
      const now = new Date().toISOString();
      
      // Заказы для userId1
      for (let i = 0; i < 5; i++) {
        const orderId = uuidv4();
        createOrder({
          id: orderId,
          userId: userId1,
          items: [{ product: `Товар ${i}`, quantity: 1, price: 100 }],
          status: i % 2 === 0 ? 'created' : 'completed',
          total: 100,
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          updatedAt: new Date(Date.now() - i * 1000).toISOString()
        });
      }

      // Заказы для userId2
      for (let i = 0; i < 3; i++) {
        const orderId = uuidv4();
        createOrder({
          id: orderId,
          userId: userId2,
          items: [{ product: `Товар ${i}`, quantity: 1, price: 200 }],
          status: 'created',
          total: 200,
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          updatedAt: new Date(Date.now() - i * 1000).toISOString()
        });
      }
    });

    test('Список своих заказов с пагинацией - ожидаем корректные поля и навигацию по страницам', async () => {
      const response = await request(app)
        .get('/v1/orders?page=1&limit=2')
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toBeDefined();
      expect(response.body.data.orders.length).toBe(2);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBe(5);
      expect(response.body.data.pagination.totalPages).toBe(3);

      // Проверяем, что все заказы принадлежат userId1
      response.body.data.orders.forEach(order => {
        expect(order.userId).toBe(userId1);
      });
    });

    test('Список заказов с фильтром по статусу - ожидаем корректную фильтрацию', async () => {
      const response = await request(app)
        .get('/v1/orders?status=created')
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.orders.forEach(order => {
        expect(order.status).toBe('created');
        expect(order.userId).toBe(userId1);
      });
    });

    test('Список заказов с сортировкой - ожидаем корректную сортировку', async () => {
      const response = await request(app)
        .get('/v1/orders?sortBy=total&sortOrder=asc')
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(200);

      expect(response.body.success).toBe(true);
      const totals = response.body.data.orders.map(o => o.total);
      const sortedTotals = [...totals].sort((a, b) => a - b);
      expect(totals).toEqual(sortedTotals);
    });

    test('Администратор видит все заказы - ожидаем успех', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['admin']))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orders.length).toBeGreaterThan(5);
    });
  });

  describe('PATCH /v1/orders/:orderId/status', () => {
    test('Попытка обновить чужой заказ - ожидаем отказ', async () => {
      // Создаем заказ для userId1
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [{ product: 'Товар 1', quantity: 1, price: 100 }],
        status: 'created',
        total: 100,
        createdAt: now,
        updatedAt: now
      });

      // Пытаемся обновить статус от имени userId2
      const response = await request(app)
        .patch(`/v1/orders/${orderId}/status`)
        .set('X-User-Id', userId2)
        .set('X-User-Roles', JSON.stringify(['user']))
        .send({ status: 'in_work' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    test('Обновление статуса заказа администратором - ожидаем успех', async () => {
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [{ product: 'Товар 1', quantity: 1, price: 100 }],
        status: 'created',
        total: 100,
        createdAt: now,
        updatedAt: now
      });

      const response = await request(app)
        .patch(`/v1/orders/${orderId}/status`)
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['admin']))
        .send({ status: 'in_work' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('in_work');
    });
  });

  describe('POST /v1/orders/:orderId/cancel', () => {
    test('Отмена собственного заказа - ожидаем статус отменён и отсутствие побочных эффектов', async () => {
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [
          {
            product: 'Товар 1',
            quantity: 2,
            price: 100.50
          }
        ],
        status: 'created',
        total: 201.00,
        createdAt: now,
        updatedAt: now
      });

      const response = await request(app)
        .post(`/v1/orders/${orderId}/cancel`)
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.id).toBe(orderId);
      expect(response.body.data.userId).toBe(userId1);
      expect(response.body.data.total).toBe(201.00);
      expect(response.body.data.items).toBeDefined();
      
      // Проверяем, что заказ действительно обновлен в базе
      expect(getOrderById(orderId).status).toBe('cancelled');
    });

    test('Отмена уже отмененного заказа - ожидаем ошибку', async () => {
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [{ product: 'Товар 1', quantity: 1, price: 100 }],
        status: 'cancelled',
        total: 100,
        createdAt: now,
        updatedAt: now
      });

      const response = await request(app)
        .post(`/v1/orders/${orderId}/cancel`)
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_STATUS');
    });

    test('Отмена выполненного заказа - ожидаем ошибку', async () => {
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [{ product: 'Товар 1', quantity: 1, price: 100 }],
        status: 'completed',
        total: 100,
        createdAt: now,
        updatedAt: now
      });

      const response = await request(app)
        .post(`/v1/orders/${orderId}/cancel`)
        .set('X-User-Id', userId1)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_STATUS');
    });

    test('Отмена чужого заказа - ожидаем отказ', async () => {
      const orderId = uuidv4();
      const now = new Date().toISOString();
      createOrder({
        id: orderId,
        userId: userId1,
        items: [{ product: 'Товар 1', quantity: 1, price: 100 }],
        status: 'created',
        total: 100,
        createdAt: now,
        updatedAt: now
      });

      const response = await request(app)
        .post(`/v1/orders/${orderId}/cancel`)
        .set('X-User-Id', userId2)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});


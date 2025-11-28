const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { app, usersDb } = require('./index');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

describe('User Service Tests', () => {
  beforeEach(() => {
    // Clear database before each test
    Object.keys(usersDb).forEach(key => delete usersDb[key]);
  });

  describe('POST /v1/users/register', () => {
    test('Успешная регистрация с валидными полями - ожидаем статус успех и созданный идентификатор', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/v1/users/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.email).toBe(userData.email);
      expect(response.body.data.name).toBe(userData.name);
      expect(response.body.data.roles).toEqual(['user']);
      expect(response.body.data.passwordHash).toBeUndefined();
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.updatedAt).toBeDefined();
    });

    test('Повторная регистрация с той же почтой - ожидаем контролируемую ошибку', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };

      // Первая регистрация
      await request(app)
        .post('/v1/users/register')
        .send(userData)
        .expect(201);

      // Повторная регистрация
      const response = await request(app)
        .post('/v1/users/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('USER_EXISTS');
      expect(response.body.error.message).toContain('already exists');
    });

    test('Регистрация с невалидным email - ожидаем ошибку валидации', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/v1/users/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Регистрация с коротким паролем - ожидаем ошибку валидации', async () => {
      const userData = {
        email: 'test@example.com',
        password: '12345',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/v1/users/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /v1/users/login', () => {
    beforeEach(async () => {
      // Создаем пользователя для тестов входа
      const passwordHash = await bcrypt.hash('password123', 10);
      const userId = require('uuid').v4();
      usersDb[userId] = {
        id: userId,
        email: 'test@example.com',
        passwordHash,
        name: 'Test User',
        roles: ['user'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    test('Вход с правильными данными - ожидаем выдачу токена', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/v1/users/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe(loginData.email);

      // Проверяем, что токен валидный
      const decoded = jwt.verify(response.body.data.token, JWT_SECRET);
      expect(decoded.userId).toBeDefined();
      expect(decoded.email).toBe(loginData.email);
    });

    test('Вход с неправильным паролем - ожидаем ошибку', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/v1/users/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('Вход с несуществующим email - ожидаем ошибку', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/v1/users/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Protected Routes', () => {
    test('Доступ к защищённому пути без токена - ожидаем отказ', async () => {
      const response = await request(app)
        .get('/v1/users/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    test('Доступ к защищённому пути с невалидным токеном - ожидаем отказ (обрабатывается на уровне gateway)', async () => {
      const response = await request(app)
        .get('/v1/users/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      // User Service не проверяет JWT, поэтому при отсутствии X-User-Id
      // он возвращает UNAUTHORIZED. Проверка INVALID_TOKEN происходит в gateway.
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    test('Доступ к защищённому пути с валидным токеном через заголовки - ожидаем успех', async () => {
      // Создаем пользователя
      const passwordHash = await bcrypt.hash('password123', 10);
      const userId = require('uuid').v4();
      usersDb[userId] = {
        id: userId,
        email: 'test@example.com',
        passwordHash,
        name: 'Test User',
        roles: ['user'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Имитируем заголовки от gateway
      const response = await request(app)
        .get('/v1/users/me')
        .set('X-User-Id', userId)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(userId);
      expect(response.body.data.email).toBe('test@example.com');
    });
  });

  describe('GET /v1/users/me', () => {
    test('Получение профиля авторизованного пользователя - ожидаем успех', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      const userId = require('uuid').v4();
      usersDb[userId] = {
        id: userId,
        email: 'test@example.com',
        passwordHash,
        name: 'Test User',
        roles: ['user'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const response = await request(app)
        .get('/v1/users/me')
        .set('X-User-Id', userId)
        .set('X-User-Roles', JSON.stringify(['user']))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(userId);
      expect(response.body.data.email).toBe('test@example.com');
      expect(response.body.data.name).toBe('Test User');
      expect(response.body.data.passwordHash).toBeUndefined();
    });
  });

  describe('PUT /v1/users/me', () => {
    test('Обновление профиля авторизованного пользователя - ожидаем успех', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      const userId = require('uuid').v4();
      usersDb[userId] = {
        id: userId,
        email: 'test@example.com',
        passwordHash,
        name: 'Test User',
        roles: ['user'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const updateData = {
        name: 'Updated Name'
      };

      const response = await request(app)
        .put('/v1/users/me')
        .set('X-User-Id', userId)
        .set('X-User-Roles', JSON.stringify(['user']))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.email).toBe('test@example.com');
    });
  });
});


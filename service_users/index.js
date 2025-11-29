const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const pino = require('pino');
const pinoHttp = require('pino-http');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Logger setup
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
//   ...(process.env.NODE_ENV !== 'production' && {
//     transport: {
//       target: 'pino-pretty',
//       options: {
//         colorize: true
//       }
//     }
//   })
});

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || req.id
});

// Middleware
app.use(httpLogger);
app.use(cors());
app.use(express.json());

// In-memory database
let usersDb = {};

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional()
});

// Helper function to create standardized response
const createResponse = (success, data = null, error = null) => {
  return { success, data, error };
};

// Helper function to create error response
const createError = (code, message) => {
  return createResponse(false, null, { code, message });
};

// Extract user from headers (set by gateway)
const getUserFromHeaders = (req) => {
  const userId = req.headers['x-user-id'];
  const rolesHeader = req.headers['x-user-roles'];
  let roles = [];
  
  if (rolesHeader) {
    try {
      roles = JSON.parse(rolesHeader);
    } catch (e) {
      logger.warn('Failed to parse user roles from header');
    }
  }
  
  return { userId, roles };
};

// Check if user is admin
const isAdmin = (req) => {
  const { roles } = getUserFromHeaders(req);
  return Array.isArray(roles) && roles.includes('admin');
};

// Register new user
app.post('/v1/users/register', async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = Object.values(usersDb).find(u => u.email === validatedData.email);
    if (existingUser) {
      return res.status(409).json(createError('USER_EXISTS', 'User with this email already exists'));
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(validatedData.password, 10);
    
    // Create user
    const userId = uuidv4();
    const now = new Date().toISOString();
    const newUser = {
      id: userId,
      email: validatedData.email,
      passwordHash,
      name: validatedData.name,
      roles: ['user'], // Default role
      createdAt: now,
      updatedAt: now
    };
    
    usersDb[userId] = newUser;
    
    logger.info({ userId, email: validatedData.email }, 'User registered');
    
    // Return user without password hash
    const { passwordHash: _, ...userResponse } = newUser;
    
    res.status(201).json(createResponse(true, userResponse));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    logger.error({ error }, 'Registration error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to register user'));
  }
});

// Login
app.post('/v1/users/login', async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    
    // Find user
    const user = Object.values(usersDb).find(u => u.email === validatedData.email);
    if (!user) {
      return res.status(401).json(createError('INVALID_CREDENTIALS', 'Invalid email or password'));
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(validatedData.password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json(createError('INVALID_CREDENTIALS', 'Invalid email or password'));
    }
    
    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roles: user.roles
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    logger.info({ userId: user.id, email: user.email }, 'User logged in');
    
    res.json(createResponse(true, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles
      }
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    logger.error({ error }, 'Login error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to login'));
  }
});

// Get current profile
app.get('/v1/users/me', (req, res) => {
  try {
    const { userId } = getUserFromHeaders(req);
    
    if (!userId) {
      return res.status(401).json(createError('UNAUTHORIZED', 'User ID not found'));
    }
    
    const user = usersDb[userId];
    if (!user) {
      return res.status(404).json(createError('USER_NOT_FOUND', 'User not found'));
    }
    
    const { passwordHash: _, ...userResponse } = user;
    res.json(createResponse(true, userResponse));
  } catch (error) {
    logger.error({ error }, 'Get profile error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to get profile'));
  }
});

// Update current profile
app.put('/v1/users/me', async (req, res) => {
  try {
    const { userId } = getUserFromHeaders(req);
    
    if (!userId) {
      return res.status(401).json(createError('UNAUTHORIZED', 'User ID not found'));
    }
    
    const user = usersDb[userId];
    if (!user) {
      return res.status(404).json(createError('USER_NOT_FOUND', 'User not found'));
    }
    
    const validatedData = updateProfileSchema.parse(req.body);
    
    // Check if email is being changed and if it's already taken
    if (validatedData.email && validatedData.email !== user.email) {
      const existingUser = Object.values(usersDb).find(u => u.email === validatedData.email && u.id !== userId);
      if (existingUser) {
        return res.status(409).json(createError('EMAIL_EXISTS', 'Email already in use'));
      }
    }
    
    // Update user
    const updatedUser = {
      ...user,
      ...validatedData,
      updatedAt: new Date().toISOString()
    };
    
    usersDb[userId] = updatedUser;
    
    logger.info({ userId }, 'Profile updated');
    
    const { passwordHash: _, ...userResponse } = updatedUser;
    res.json(createResponse(true, userResponse));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    logger.error({ error }, 'Update profile error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to update profile'));
  }
});

// List users (admin only)
app.get('/v1/users', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json(createError('FORBIDDEN', 'Admin access required'));
    }
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Filtering
    let users = Object.values(usersDb);
    
    if (req.query.email) {
      users = users.filter(u => u.email.includes(req.query.email));
    }
    
    if (req.query.role) {
      users = users.filter(u => u.roles.includes(req.query.role));
    }
    
    // Sort by createdAt (newest first)
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Paginate
    const total = users.length;
    const paginatedUsers = users.slice(offset, offset + limit);
    
    // Remove password hashes
    const usersResponse = paginatedUsers.map(({ passwordHash: _, ...user }) => user);
    
    res.json(createResponse(true, {
      users: usersResponse,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }));
  } catch (error) {
    logger.error({ error }, 'List users error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to list users'));
  }
});

// Get user by ID (admin only)
app.get('/v1/users/:userId', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json(createError('FORBIDDEN', 'Admin access required'));
    }
    
    const user = usersDb[req.params.userId];
    if (!user) {
      return res.status(404).json(createError('USER_NOT_FOUND', 'User not found'));
    }
    
    const { passwordHash: _, ...userResponse } = user;
    res.json(createResponse(true, userResponse));
  } catch (error) {
    logger.error({ error }, 'Get user error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to get user'));
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json(createResponse(true, {
    status: 'OK',
    service: 'Users Service',
    timestamp: new Date().toISOString()
  }));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(err.status || 500).json(createError(
    err.code || 'INTERNAL_ERROR',
    err.message || 'Internal server error'
  ));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json(createError('NOT_FOUND', 'Route not found'));
});

// Export app and db for testing
module.exports = { app, usersDb };

// Start server only if this file is run directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Users service started');
    
    // Create default admin user for testing
    const adminId = uuidv4();
    const now = new Date().toISOString();
    bcrypt.hash('admin123', 10).then(hash => {
      usersDb[adminId] = {
        id: adminId,
        email: 'admin@example.com',
        passwordHash: hash,
        name: 'Admin User',
        roles: ['admin', 'user'],
        createdAt: now,
        updatedAt: now
      };
      logger.info('Default admin user created: admin@example.com / admin123');
    });
  });
}

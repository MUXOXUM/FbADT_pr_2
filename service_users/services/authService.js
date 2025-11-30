const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../config/logger');
const { createResponse, createError } = require('../utils/response');
const { getUserByEmail, createUser } = require('../database/users');

const registerUser = async (userData) => {
  // Check if user already exists
  const existingUser = getUserByEmail(userData.email);
  if (existingUser) {
    throw { code: 'USER_EXISTS', message: 'User with this email already exists', status: 409 };
  }
  
  // Hash password
  const passwordHash = await bcrypt.hash(userData.password, 10);
  
  // Create user
  const userId = uuidv4();
  const now = new Date().toISOString();
  const newUser = {
    id: userId,
    email: userData.email,
    passwordHash,
    name: userData.name,
    roles: ['user'], // Default role
    createdAt: now,
    updatedAt: now
  };
  
  createUser(newUser);
  
  logger.info({ userId, email: userData.email }, 'User registered');
  
  // Return user without password hash
  const { passwordHash: _, ...userResponse } = newUser;
  
  return userResponse;
};

const loginUser = async (email, password) => {
  // Find user
  const user = getUserByEmail(email);
  if (!user) {
    throw { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', status: 401 };
  }
  
  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    throw { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', status: 401 };
  }
  
  // Generate JWT
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      roles: user.roles
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
  
  logger.info({ userId: user.id, email: user.email }, 'User logged in');
  
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles
    }
  };
};

module.exports = {
  registerUser,
  loginUser
};


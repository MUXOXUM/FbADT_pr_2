const express = require('express');
const { z } = require('zod');
const logger = require('../config/logger');
const { createResponse, createError } = require('../utils/response');
const { updateProfileSchema } = require('../models/validation');
const { getUserFromHeaders, isAdmin } = require('../middleware/auth');
const { getUserProfile, updateUserProfile, listUsers } = require('../services/userService');
const { getUserById } = require('../database/users');

const router = express.Router();

// Get current profile
router.get('/me', (req, res) => {
  try {
    const { userId } = getUserFromHeaders(req);
    
    if (!userId) {
      return res.status(401).json(createError('UNAUTHORIZED', 'User ID not found'));
    }
    
    const user = getUserProfile(userId);
    res.json(createResponse(true, user));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(createError(error.code, error.message));
    }
    logger.error({ error }, 'Get profile error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to get profile'));
  }
});

// Update current profile
router.put('/me', async (req, res) => {
  try {
    const { userId } = getUserFromHeaders(req);
    
    if (!userId) {
      return res.status(401).json(createError('UNAUTHORIZED', 'User ID not found'));
    }
    
    const currentUser = getUserById(userId);
    if (!currentUser) {
      return res.status(404).json(createError('USER_NOT_FOUND', 'User not found'));
    }
    
    const validatedData = updateProfileSchema.parse(req.body);
    const updatedUser = updateUserProfile(userId, validatedData, currentUser.email);
    res.json(createResponse(true, updatedUser));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    if (error.status) {
      return res.status(error.status).json(createError(error.code, error.message));
    }
    logger.error({ error }, 'Update profile error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to update profile'));
  }
});

// List users (admin only)
router.get('/', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json(createError('FORBIDDEN', 'Admin access required'));
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const filters = {
      email: req.query.email,
      role: req.query.role
    };
    
    const pagination = { page, limit };
    
    const result = listUsers(filters, pagination);
    res.json(createResponse(true, result));
  } catch (error) {
    logger.error({ error }, 'List users error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to list users'));
  }
});

// Get user by ID (admin only)
router.get('/:userId', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json(createError('FORBIDDEN', 'Admin access required'));
    }
    
    const user = getUserById(req.params.userId);
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

module.exports = router;


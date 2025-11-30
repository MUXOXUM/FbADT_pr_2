const express = require('express');
const { z } = require('zod');
const logger = require('../config/logger');
const { createResponse, createError } = require('../utils/response');
const { registerSchema, loginSchema } = require('../models/validation');
const { registerUser, loginUser } = require('../services/authService');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const user = await registerUser(validatedData);
    res.status(201).json(createResponse(true, user));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    if (error.status) {
      return res.status(error.status).json(createError(error.code, error.message));
    }
    logger.error({ error }, 'Registration error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to register user'));
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await loginUser(validatedData.email, validatedData.password);
    res.json(createResponse(true, result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    if (error.status) {
      return res.status(error.status).json(createError(error.code, error.message));
    }
    logger.error({ error }, 'Login error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to login'));
  }
});

module.exports = router;


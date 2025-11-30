const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');

// Verify user exists in users service
const verifyUserExists = async (userId) => {
  try {
    const response = await axios.get(`${config.USERS_SERVICE_URL}/v1/users/${userId}`, {
      headers: {
        'X-User-Id': userId,
        'X-User-Roles': JSON.stringify(['admin'])
      },
      validateStatus: () => true
    });
    return response.status === 200;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to verify user');
    return false;
  }
};

module.exports = {
  verifyUserExists
};


module.exports = {
  PORT: process.env.PORT || 8000,
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  USERS_SERVICE_URL: process.env.USERS_SERVICE_URL || 'http://service_users:8000'
};


const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // В production и при запуске тестов не используем pino-pretty,
  // его можно включить вручную через переменную окружения PINO_PRETTY=true
  ...(process.env.PINO_PRETTY === 'true' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  })
});

module.exports = logger;


const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// Domain events (prepared for message broker integration)
const eventEmitter = {
  events: [],
  emit(eventType, data) {
    const event = {
      id: uuidv4(),
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };
    this.events.push(event);
    logger.info({ event }, 'Domain event emitted');
    // TODO: Publish to message broker in future iterations
  }
};

module.exports = eventEmitter;


// Helper function to create standardized response
const createResponse = (success, data = null, error = null) => {
  return { success, data, error };
};

// Helper function to create error response
const createError = (code, message) => {
  return createResponse(false, null, { code, message });
};

module.exports = {
  createResponse,
  createError
};


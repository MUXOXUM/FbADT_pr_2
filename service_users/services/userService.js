const logger = require('../config/logger');
const { getUserById, updateUser, getAllUsers } = require('../database/users');

const getUserProfile = (userId) => {
  const user = getUserById(userId);
  if (!user) {
    throw { code: 'USER_NOT_FOUND', message: 'User not found', status: 404 };
  }
  
  // Return user without password hash
  const { passwordHash: _, ...userResponse } = user;
  return userResponse;
};

const updateUserProfile = (userId, updates, currentEmail) => {
  const user = getUserById(userId);
  if (!user) {
    throw { code: 'USER_NOT_FOUND', message: 'User not found', status: 404 };
  }
  
  // Check if email is being changed and if it's already taken
  if (updates.email && updates.email !== currentEmail) {
    const existingUser = getAllUsers().find(u => u.email === updates.email && u.id !== userId);
    if (existingUser) {
      throw { code: 'EMAIL_EXISTS', message: 'Email already in use', status: 409 };
    }
  }
  
  const updatedUser = updateUser(userId, updates);
  logger.info({ userId }, 'Profile updated');
  
  // Return user without password hash
  const { passwordHash: _, ...userResponse } = updatedUser;
  return userResponse;
};

const listUsers = (filters = {}, pagination = {}) => {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  
  // Filtering
  let users = getAllUsers();
  
  if (filters.email) {
    users = users.filter(u => u.email.includes(filters.email));
  }
  
  if (filters.role) {
    users = users.filter(u => u.roles.includes(filters.role));
  }
  
  // Sort by createdAt (newest first)
  users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // Paginate
  const total = users.length;
  const paginatedUsers = users.slice(offset, offset + limit);
  
  // Remove password hashes
  const usersResponse = paginatedUsers.map(({ passwordHash: _, ...user }) => user);
  
  return {
    users: usersResponse,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  listUsers
};


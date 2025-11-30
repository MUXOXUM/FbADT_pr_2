// In-memory database
let usersDb = {};

const getUserById = (userId) => {
  return usersDb[userId];
};

const getUserByEmail = (email) => {
  return Object.values(usersDb).find(u => u.email === email);
};

const createUser = (user) => {
  usersDb[user.id] = user;
  return user;
};

const updateUser = (userId, updates) => {
  if (!usersDb[userId]) {
    return null;
  }
  usersDb[userId] = {
    ...usersDb[userId],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return usersDb[userId];
};

const getAllUsers = () => {
  return Object.values(usersDb);
};

const deleteUser = (userId) => {
  delete usersDb[userId];
};

// For testing
const clearDatabase = () => {
  usersDb = {};
};

module.exports = {
  usersDb,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  getAllUsers,
  deleteUser,
  clearDatabase
};


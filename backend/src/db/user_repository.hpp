#pragma once

#include "../auth/auth_service.hpp"
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace roaya {

/**
 * User repository interface for database operations
 * Current implementation: In-memory (ready for PostgreSQL integration)
 */
class UserRepository {
public:
  static UserRepository &getInstance() {
    static UserRepository instance;
    return instance;
  }

  // Create a new user
  virtual std::optional<User> create(const User &user);

  // Find user by ID
  virtual std::optional<User> findById(const std::string &id);

  // Find user by email
  virtual std::optional<User> findByEmail(const std::string &email);

  // Update user
  virtual bool update(const User &user);

  // Delete user
  virtual bool remove(const std::string &id);

  // List all users (admin only, paginated)
  virtual std::vector<User> findAll(int limit = 100, int offset = 0);

  // Count total users
  virtual size_t count();

private:
  UserRepository() = default;

  // In-memory storage (replace with database client)
  std::unordered_map<std::string, User> users_;
  std::mutex mutex_;
};

} // namespace roaya

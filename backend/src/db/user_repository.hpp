#pragma once

#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace roaya {

struct User;

/**
 * @brief User repository handles persistence for User entities
 */
class UserRepository {
public:
  static UserRepository &getInstance();

  // Create a new user
  std::optional<User> create(const User &user);

  // Find user by ID
  std::optional<User> findById(const std::string &id);

  // Find user by email
  std::optional<User> findByEmail(const std::string &email);

  // Update user
  bool update(const User &user);

  // Delete user
  bool remove(const std::string &id);

  // List all users (admin only, paginated)
  std::vector<User> findAll(int limit = 100, int offset = 0);

  // Count total users
  size_t count();

private:
  UserRepository() = default;
  ~UserRepository() = default;
};

} // namespace roaya

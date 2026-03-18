#pragma once

#include "jwt_handler.hpp"
#include <optional>
#include <string>

namespace roaya {

/**
 * User data structure
 */
struct User {
  std::string id;
  std::string email;
  std::string name;
  std::string passwordHash;
  std::string avatarUrl;
  int64_t createdAt;
  int64_t lastLogin;
};

/**
 * Auth result
 */
struct AuthResult {
  bool success;
  std::string message;
  std::optional<std::string> token;
  std::optional<User> user;
};

/**
 * Authentication service for user registration and login
 */
class AuthService {
public:
  static AuthService &getInstance();

  // Register a new user
  AuthResult registerUser(const std::string &email, const std::string &password,
                          const std::string &name);

  // Login with email and password
  AuthResult login(const std::string &email, const std::string &password);

  // Verify token and get user
  std::optional<User> verifyToken(const std::string &token);

  // Logout (invalidate token)
  bool logout(const std::string &token);

  // Change password
  bool changePassword(const std::string &userId, const std::string &oldPassword,
                      const std::string &newPassword);

  // Update user profile
  bool updateProfile(const std::string &userId, const std::string &name,
                     const std::string &avatarUrl);

private:
  AuthService() = default;

  std::string generateUserId();
};

} // namespace roaya

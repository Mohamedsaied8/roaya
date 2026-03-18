#include "auth_service.hpp"
#include "../core/logger.hpp"
#include "password_hasher.hpp"
#include <chrono>
#include <iomanip>
#include <random>
#include <sstream>

namespace roaya {

AuthService &AuthService::getInstance() {
  static AuthService instance;
  return instance;
}

std::string AuthService::generateUserId() {
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_int_distribution<uint64_t> dis;

  std::stringstream ss;
  ss << "user_" << std::hex << dis(gen);
  return ss.str();
}

AuthResult AuthService::registerUser(const std::string &email,
                                     const std::string &password,
                                     const std::string &name) {
  std::lock_guard<std::mutex> lock(mutex_);

  // Check if email already exists
  if (emails_.find(email) != emails_.end()) {
    return {false, "Email already registered", std::nullopt, std::nullopt};
  }

  // Validate input
  if (email.empty() || password.empty() || name.empty()) {
    return {false, "Email, password, and name are required", std::nullopt,
            std::nullopt};
  }

  if (password.length() < 8) {
    return {false, "Password must be at least 8 characters", std::nullopt,
            std::nullopt};
  }

  // Create user
  User user;
  user.id = generateUserId();
  user.email = email;
  user.name = name;
  user.passwordHash = PasswordHasher::hash(password);
  user.createdAt = std::chrono::duration_cast<std::chrono::seconds>(
                       std::chrono::system_clock::now().time_since_epoch())
                       .count();
  user.lastLogin = user.createdAt;

  // Store user
  users_[user.id] = user;
  emails_[email] = user.id;

  // Create token
  std::string token = JwtHandler::createToken(user.id, user.email, user.name);

  // Clear password hash before returning
  User safeUser = user;
  safeUser.passwordHash = "";

  LOG_INFO("User registered: {} ({})", email, user.id);
  return {true, "Registration successful", token, safeUser};
}

AuthResult AuthService::login(const std::string &email,
                              const std::string &password) {
  std::lock_guard<std::mutex> lock(mutex_);

  // Find user by email
  auto emailIt = emails_.find(email);
  if (emailIt == emails_.end()) {
    return {false, "Invalid email or password", std::nullopt, std::nullopt};
  }

  auto userIt = users_.find(emailIt->second);
  if (userIt == users_.end()) {
    return {false, "Invalid email or password", std::nullopt, std::nullopt};
  }

  User &user = userIt->second;

  // Verify password
  if (!PasswordHasher::verify(password, user.passwordHash)) {
    LOG_WARN("Failed login attempt for: {}", email);
    return {false, "Invalid email or password", std::nullopt, std::nullopt};
  }

  // Update last login
  user.lastLogin = std::chrono::duration_cast<std::chrono::seconds>(
                       std::chrono::system_clock::now().time_since_epoch())
                       .count();

  // Create token
  std::string token = JwtHandler::createToken(user.id, user.email, user.name);

  // Clear password hash before returning
  User safeUser = user;
  safeUser.passwordHash = "";

  LOG_INFO("User logged in: {} ({})", email, user.id);
  return {true, "Login successful", token, safeUser};
}

std::optional<User> AuthService::verifyToken(const std::string &token) {
  auto payload = JwtHandler::verifyToken(token);
  if (!payload) {
    return std::nullopt;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  auto it = users_.find(payload->userId);
  if (it == users_.end()) {
    return std::nullopt;
  }

  User safeUser = it->second;
  safeUser.passwordHash = "";
  return safeUser;
}

bool AuthService::logout(const std::string &token) {
  // In a production system, you would add the token to a blacklist
  // For now, we just verify it's valid
  return JwtHandler::verifyToken(token).has_value();
}

bool AuthService::changePassword(const std::string &userId,
                                 const std::string &oldPassword,
                                 const std::string &newPassword) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = users_.find(userId);
  if (it == users_.end()) {
    return false;
  }

  if (!PasswordHasher::verify(oldPassword, it->second.passwordHash)) {
    return false;
  }

  if (newPassword.length() < 8) {
    return false;
  }

  it->second.passwordHash = PasswordHasher::hash(newPassword);
  LOG_INFO("Password changed for user: {}", userId);
  return true;
}

bool AuthService::updateProfile(const std::string &userId,
                                const std::string &name,
                                const std::string &avatarUrl) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = users_.find(userId);
  if (it == users_.end()) {
    return false;
  }

  if (!name.empty()) {
    it->second.name = name;
  }
  if (!avatarUrl.empty()) {
    it->second.avatarUrl = avatarUrl;
  }

  LOG_INFO("Profile updated for user: {}", userId);
  return true;
}

} // namespace roaya

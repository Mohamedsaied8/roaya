#include "auth_service.hpp"
#include "../core/logger.hpp"
#include "../db/user_repository.hpp"
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
  // Validate input
  if (email.empty() || password.empty() || name.empty()) {
    return {false, "Email, password, and name are required", std::nullopt,
            std::nullopt};
  }

  if (password.length() < 8) {
    return {false, "Password must be at least 8 characters", std::nullopt,
            std::nullopt};
  }

  auto &repo = UserRepository::getInstance();

  // Check if email already exists
  if (repo.findByEmail(email).has_value()) {
    return {false, "Email already registered", std::nullopt, std::nullopt};
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
  auto createdUser = repo.create(user);
  if (!createdUser) {
    return {false, "Failed to create user in database", std::nullopt, std::nullopt};
  }

  // Create token
  std::string token = JwtHandler::createToken(user.id, user.email, user.name);

  // Clear password hash before returning
  User safeUser = *createdUser;
  safeUser.passwordHash = "";

  LOG_INFO("User registered: {} ({})", email, user.id);
  return {true, "Registration successful", token, safeUser};
}

AuthResult AuthService::login(const std::string &email,
                              const std::string &password) {
  auto &repo = UserRepository::getInstance();

  // Find user by email
  auto userOpt = repo.findByEmail(email);
  if (!userOpt) {
    return {false, "Invalid email or password", std::nullopt, std::nullopt};
  }

  User &user = *userOpt;

  // Verify password
  if (!PasswordHasher::verify(password, user.passwordHash)) {
    LOG_WARN("Failed login attempt for: {}", email);
    return {false, "Invalid email or password", std::nullopt, std::nullopt};
  }

  // Update last login
  user.lastLogin = std::chrono::duration_cast<std::chrono::seconds>(
                       std::chrono::system_clock::now().time_since_epoch())
                       .count();
  repo.update(user);

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

  auto &repo = UserRepository::getInstance();
  auto userOpt = repo.findById(payload->userId);
  if (!userOpt) {
    return std::nullopt;
  }

  User safeUser = *userOpt;
  safeUser.passwordHash = "";
  return safeUser;
}

bool AuthService::logout(const std::string &token) {
  return JwtHandler::verifyToken(token).has_value();
}

bool AuthService::changePassword(const std::string &userId,
                                 const std::string &oldPassword,
                                 const std::string &newPassword) {
  auto &repo = UserRepository::getInstance();
  auto userOpt = repo.findById(userId);
  if (!userOpt) {
    return false;
  }

  if (!PasswordHasher::verify(oldPassword, userOpt->passwordHash)) {
    return false;
  }

  if (newPassword.length() < 8) {
    return false;
  }

  userOpt->passwordHash = PasswordHasher::hash(newPassword);
  repo.update(*userOpt);
  LOG_INFO("Password changed for user: {}", userId);
  return true;
}

bool AuthService::updateProfile(const std::string &userId,
                                const std::string &name,
                                const std::string &avatarUrl) {
  auto &repo = UserRepository::getInstance();
  auto userOpt = repo.findById(userId);
  if (!userOpt) {
    return false;
  }

  if (!name.empty()) {
    userOpt->name = name;
  }
  if (!avatarUrl.empty()) {
    userOpt->avatarUrl = avatarUrl;
  }

  repo.update(*userOpt);
  LOG_INFO("Profile updated for user: {}", userId);
  return true;
}

} // namespace roaya

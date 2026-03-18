#pragma once

#include "../../auth/auth_service.hpp"
#include "../../core/logger.hpp"
#include "../http_types.hpp"

namespace roaya {

/**
 * Authentication API routes
 */
class AuthRoutes {
public:
  /**
   * POST /api/auth/register
   * Body: { email, password, name }
   */
  static void handleRegister(HttpRequest &req, HttpResponse &res) {
    auto body = req.json();

    std::string email = body.value("email", "");
    std::string password = body.value("password", "");
    std::string name = body.value("name", "");

    if (email.empty() || password.empty() || name.empty()) {
      res.error("Email, password, and name are required");
      return;
    }

    auto result =
        AuthService::getInstance().registerUser(email, password, name);

    if (!result.success) {
      res.error(result.message);
      return;
    }

    res.success({{"token", result.token.value()},
                 {"user",
                  {{"id", result.user->id},
                   {"email", result.user->email},
                   {"name", result.user->name}}}});

    LOG_INFO("User registered: {}", email);
  }

  /**
   * POST /api/auth/login
   * Body: { email, password }
   */
  static void handleLogin(HttpRequest &req, HttpResponse &res) {
    auto body = req.json();

    std::string email = body.value("email", "");
    std::string password = body.value("password", "");

    if (email.empty() || password.empty()) {
      res.error("Email and password are required");
      return;
    }

    auto result = AuthService::getInstance().login(email, password);

    if (!result.success) {
      res.error(result.message, 401);
      return;
    }

    res.success({{"token", result.token.value()},
                 {"user",
                  {{"id", result.user->id},
                   {"email", result.user->email},
                   {"name", result.user->name}}}});

    LOG_INFO("User logged in: {}", email);
  }

  /**
   * POST /api/auth/logout
   * Headers: Authorization: Bearer <token>
   */
  static void handleLogout(HttpRequest &req, HttpResponse &res) {
    std::string token = req.getAuthToken();

    if (token.empty()) {
      res.error("No token provided", 401);
      return;
    }

    AuthService::getInstance().logout(token);
    res.success();
  }

  /**
   * GET /api/auth/profile
   * Headers: Authorization: Bearer <token>
   */
  static void handleGetProfile(HttpRequest &req, HttpResponse &res) {
    std::string userId = req.params["userId"];
    std::string token = req.getAuthToken();

    auto user = AuthService::getInstance().verifyToken(token);
    if (!user) {
      res.error("Invalid token", 401);
      return;
    }

    res.success({{"user",
                  {{"id", user->id},
                   {"email", user->email},
                   {"name", user->name},
                   {"avatarUrl", user->avatarUrl}}}});
  }

  /**
   * PUT /api/auth/profile
   * Body: { name?, avatarUrl? }
   */
  static void handleUpdateProfile(HttpRequest &req, HttpResponse &res) {
    std::string userId = req.params["userId"];
    auto body = req.json();

    std::string name = body.value("name", "");
    std::string avatarUrl = body.value("avatarUrl", "");

    if (!AuthService::getInstance().updateProfile(userId, name, avatarUrl)) {
      res.error("Failed to update profile");
      return;
    }

    res.success();
  }

  /**
   * POST /api/auth/change-password
   * Body: { oldPassword, newPassword }
   */
  static void handleChangePassword(HttpRequest &req, HttpResponse &res) {
    std::string userId = req.params["userId"];
    auto body = req.json();

    std::string oldPassword = body.value("oldPassword", "");
    std::string newPassword = body.value("newPassword", "");

    if (oldPassword.empty() || newPassword.empty()) {
      res.error("Old and new password are required");
      return;
    }

    if (newPassword.length() < 8) {
      res.error("New password must be at least 8 characters");
      return;
    }

    if (!AuthService::getInstance().changePassword(userId, oldPassword,
                                                   newPassword)) {
      res.error("Invalid current password");
      return;
    }

    res.success({{"message", "Password changed successfully"}});
  }
};

} // namespace roaya

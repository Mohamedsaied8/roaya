#pragma once

#include "../../auth/auth_service.hpp"
#include "../http_types.hpp"
#include <string>

namespace roaya {

/**
 * Authentication middleware
 */
class AuthMiddleware {
public:
  using NextHandler = std::function<void(HttpRequest &, HttpResponse &)>;

  /**
   * Require authentication middleware
   * Verifies JWT token and adds user info to request
   */
  static void requireAuth(HttpRequest &req, HttpResponse &res,
                          NextHandler next) {
    std::string token = req.getAuthToken();

    if (token.empty()) {
      res.error("Authentication required", 401);
      return;
    }

    auto user = AuthService::getInstance().verifyToken(token);
    if (!user) {
      res.error("Invalid or expired token", 401);
      return;
    }

    // Add user info to request params for route handlers
    req.params["userId"] = user->id;
    req.params["userEmail"] = user->email;
    req.params["userName"] = user->name;

    next(req, res);
  }

  /**
   * Optional authentication middleware
   * Adds user info if token present, but doesn't require it
   */
  static void optionalAuth(HttpRequest &req, HttpResponse &res,
                           NextHandler next) {
    std::string token = req.getAuthToken();

    if (!token.empty()) {
      auto user = AuthService::getInstance().verifyToken(token);
      if (user) {
        req.params["userId"] = user->id;
        req.params["userEmail"] = user->email;
        req.params["userName"] = user->name;
      }
    }

    next(req, res);
  }
};

} // namespace roaya

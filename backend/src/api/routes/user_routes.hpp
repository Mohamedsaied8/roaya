#pragma once

#include "../../auth/auth_service.hpp"
#include "../../core/logger.hpp"
#include "../http_types.hpp"

namespace roaya {

/**
 * User API routes
 */
class UserRoutes {
public:
  /**
   * GET /api/users/:id
   */
  static void handleGetUser(HttpRequest &req, HttpResponse &res) {
    std::string userId = req.params["id"];
    std::string token = req.getAuthToken();

    // For now, users can only get their own profile
    auto currentUser = AuthService::getInstance().verifyToken(token);
    if (!currentUser || currentUser->id != userId) {
      res.error("Access denied", 403);
      return;
    }

    res.success({{"user",
                  {{"id", currentUser->id},
                   {"email", currentUser->email},
                   {"name", currentUser->name},
                   {"avatarUrl", currentUser->avatarUrl}}}});
  }

  /**
   * PUT /api/users/:id
   * Body: { name?, avatarUrl? }
   */
  static void handleUpdateUser(HttpRequest &req, HttpResponse &res) {
    std::string targetUserId = req.params["id"];
    std::string currentUserId = req.params["userId"];

    // Users can only update their own profile
    if (targetUserId != currentUserId) {
      res.error("Access denied", 403);
      return;
    }

    auto body = req.json();
    std::string name = body.value("name", "");
    std::string avatarUrl = body.value("avatarUrl", "");

    if (!AuthService::getInstance().updateProfile(targetUserId, name,
                                                  avatarUrl)) {
      res.error("Failed to update user");
      return;
    }

    res.success({{"message", "User updated successfully"}});
  }
};

} // namespace roaya

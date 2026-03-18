#pragma once

#include "../../core/logger.hpp"
#include "../../room/room_manager.hpp"
#include "../http_types.hpp"

namespace zoom {

/**
 * Room API routes
 */
class RoomRoutes {
public:
  /**
   * POST /api/rooms
   * Body: { name }
   */
  static void handleCreateRoom(HttpRequest &req, HttpResponse &res) {
    auto body = req.json();
    std::string userId = req.params["userId"];
    std::string userName = req.params["userName"];

    std::string roomName = body.value("name", "Untitled Meeting");

    auto room = RoomManager::getInstance().createRoom(roomName, userId);

    if (!room) {
      res.error("Failed to create room");
      return;
    }

    res.success({{"room", room->toJson()}});

    LOG_INFO("Room created via API: {} by {}", room->getId(), userId);
  }

  /**
   * GET /api/rooms/:id
   */
  static void handleGetRoom(HttpRequest &req, HttpResponse &res) {
    std::string roomId = req.params["id"];

    auto room = RoomManager::getInstance().getRoom(roomId);

    if (!room) {
      res.error("Room not found", 404);
      return;
    }

    res.success({{"room", room->toJsonWithParticipants()}});
  }

  /**
   * GET /api/rooms/code/:code
   */
  static void handleGetRoomByCode(HttpRequest &req, HttpResponse &res) {
    std::string code = req.params["code"];

    auto room = RoomManager::getInstance().getRoomByCode(code);

    if (!room) {
      res.error("Room not found", 404);
      return;
    }

    res.success({{"room", room->toJson()}});
  }

  /**
   * GET /api/rooms
   * Query: ?active=true
   */
  static void handleListRooms(HttpRequest &req, HttpResponse &res) {
    auto rooms = RoomManager::getInstance().getAllRooms();

    nlohmann::json roomsJson = nlohmann::json::array();
    for (const auto &room : rooms) {
      if (room->isActive()) {
        roomsJson.push_back(room->toJson());
      }
    }

    res.success({{"rooms", roomsJson}, {"count", roomsJson.size()}});
  }

  /**
   * DELETE /api/rooms/:id
   */
  static void handleDeleteRoom(HttpRequest &req, HttpResponse &res) {
    std::string roomId = req.params["id"];
    std::string userId = req.params["userId"];

    auto room = RoomManager::getInstance().getRoom(roomId);

    if (!room) {
      res.error("Room not found", 404);
      return;
    }

    // Only host can delete
    if (room->getHostId() != userId) {
      res.error("Only the host can delete this room", 403);
      return;
    }

    if (!RoomManager::getInstance().deleteRoom(roomId)) {
      res.error("Failed to delete room");
      return;
    }

    res.success();
    LOG_INFO("Room deleted via API: {} by {}", roomId, userId);
  }

  /**
   * GET /api/rooms/stats
   */
  static void handleGetStats(HttpRequest &req, HttpResponse &res) {
    res.success(
        {{"activeRooms", RoomManager::getInstance().getActiveRoomCount()},
         {"totalParticipants",
          RoomManager::getInstance().getTotalParticipantCount()},
         {"maxParticipantsPerRoom", 50}});
  }
};

} // namespace zoom

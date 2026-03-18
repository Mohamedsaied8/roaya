#include "http_server.hpp"
#include "../auth/auth_service.hpp"
#include "../core/logger.hpp"
#include "../db/user_repository.hpp"
#include "../room/room_manager.hpp"
#include "middleware/auth_middleware.hpp"
#include <httplib.h>
#include <nlohmann/json.hpp>

namespace roaya {

HttpServer::HttpServer(uint16_t port) : port_(port) {}

HttpServer::~HttpServer() { stop(); }

bool HttpServer::start() {
  if (running_.exchange(true)) {
    return false;
  }

  LOG_INFO("Starting HTTP server on port {}", port_);

  server_ = std::make_unique<httplib::Server>();

  // Enable CORS
  server_->set_base_dir("./public");

  setupRoutes();

  serverThread_ = std::thread([this]() {
    LOG_INFO("HTTP server listening on 0.0.0.0:{}", port_);
    server_->listen("0.0.0.0", port_);
  });

  return true;
}

void HttpServer::stop() {
  if (!running_.exchange(false)) {
    return;
  }

  LOG_INFO("Stopping HTTP server...");

  if (server_) {
    server_->stop();
  }

  if (serverThread_.joinable()) {
    serverThread_.join();
  }
}

void HttpServer::setupRoutes() {
  // CORS setup
  server_->set_pre_routing_handler(
      [](const httplib::Request &req, httplib::Response &res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods",
                       "GET, POST, PUT, DELETE, OPTIONS");
        res.set_header("Access-Control-Allow-Headers",
                       "Content-Type, Authorization");
        if (req.method == "OPTIONS") {
          res.status = 200;
          return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
      });

  // Health check
  server_->Get("/health",
               [](const httplib::Request &req, httplib::Response &res) {
                 res.set_content(R"({"status":"ok"})", "application/json");
               });

  // Auth routes
  setupAuthRoutes();

  // Room routes
  setupRoomRoutes();

  // User routes
  setupUserRoutes();

  LOG_DEBUG("HTTP routes configured");
}

void HttpServer::setupAuthRoutes() {
  // POST /api/auth/register
  server_->Post("/api/auth/register", [this](const httplib::Request &req,
                                             httplib::Response &res) {
    try {
      auto json = nlohmann::json::parse(req.body);

      std::string email = json.value("email", "");
      std::string password = json.value("password", "");
      std::string name = json.value("name", "");

      auto result =
          AuthService::getInstance().registerUser(email, password, name);

      if (result.success) {
        nlohmann::json response = {
            {"success", true},
            {"message", result.message},
            {"token", result.token.value_or("")},
            {"user",
             {
                 {"id", result.user->id},
                 {"email", result.user->email},
                 {"name", result.user->name},
                 {"createdAt", result.user->createdAt},
             }},
        };
        res.set_content(response.dump(), "application/json");
      } else {
        res.status = 400;
        nlohmann::json response = {{"success", false},
                                   {"message", result.message}};
        res.set_content(response.dump(), "application/json");
      }
    } catch (const std::exception &e) {
      res.status = 500;
      nlohmann::json response = {{"success", false},
                                 {"message", "Internal server error"}};
      res.set_content(response.dump(), "application/json");
    }
  });

  // POST /api/auth/login
  server_->Post("/api/auth/login", [this](const httplib::Request &req,
                                          httplib::Response &res) {
    try {
      auto json = nlohmann::json::parse(req.body);

      std::string email = json.value("email", "");
      std::string password = json.value("password", "");

      auto result = AuthService::getInstance().login(email, password);

      if (result.success) {
        nlohmann::json response = {
            {"success", true},
            {"message", result.message},
            {"token", result.token.value_or("")},
            {"user",
             {
                 {"id", result.user->id},
                 {"email", result.user->email},
                 {"name", result.user->name},
                 {"lastLogin", result.user->lastLogin},
             }},
        };
        res.set_content(response.dump(), "application/json");
      } else {
        res.status = 401;
        nlohmann::json response = {{"success", false},
                                   {"message", result.message}};
        res.set_content(response.dump(), "application/json");
      }
    } catch (const std::exception &e) {
      res.status = 500;
      nlohmann::json response = {{"success", false},
                                 {"message", "Internal server error"}};
      res.set_content(response.dump(), "application/json");
    }
  });

  // POST /api/auth/logout
  server_->Post("/api/auth/logout", [this](const httplib::Request &req,
                                           httplib::Response &res) {
    std::string token = req.get_header_value("Authorization");
    if (token.rfind("Bearer ", 0) == 0) {
      token = token.substr(7);
    }

    AuthService::getInstance().logout(token);

    nlohmann::json response = {{"success", true},
                               {"message", "Logged out successfully"}};
    res.set_content(response.dump(), "application/json");
  });

  // GET /api/auth/profile
  server_->Get("/api/auth/profile", [this](const httplib::Request &req,
                                           httplib::Response &res) {
    std::string token = req.get_header_value("Authorization");
    if (token.rfind("Bearer ", 0) == 0) {
      token = token.substr(7);
    }

    auto user = AuthService::getInstance().verifyToken(token);
    if (!user) {
      res.status = 401;
      nlohmann::json response = {{"success", false},
                                 {"message", "Invalid or expired token"}};
      res.set_content(response.dump(), "application/json");
      return;
    }

    nlohmann::json response = {
        {"success", true},
        {"user",
         {
             {"id", user->id},
             {"email", user->email},
             {"name", user->name},
             {"avatarUrl", user->avatarUrl},
             {"createdAt", user->createdAt},
             {"lastLogin", user->lastLogin},
         }},
    };
    res.set_content(response.dump(), "application/json");
  });
}

void HttpServer::setupRoomRoutes() {
  // GET /api/rooms - List active rooms
  server_->Get("/api/rooms", [this](const httplib::Request &req,
                                    httplib::Response &res) {
    auto rooms = RoomManager::getInstance().getAllRooms();

    nlohmann::json roomsJson = nlohmann::json::array();
    for (const auto &room : rooms) {
      roomsJson.push_back({
          {"id", room->getId()},
          {"name", room->getName()},
          {"meetingCode", room->getMeetingCode()},
          {"participantCount", room->getParticipantCount()},
          {"createdAt", room->getCreatedTime().time_since_epoch().count()},
      });
    }

    nlohmann::json response = {{"success", true}, {"rooms", roomsJson}};
    res.set_content(response.dump(), "application/json");
  });

  // GET /api/rooms/:id - Get room details
  server_->Get("/api/rooms/([^/]+)",
               [this](const httplib::Request &req, httplib::Response &res) {
                 std::string roomId = req.matches[1];

                 auto room = RoomManager::getInstance().getRoom(roomId);
                 if (!room) {
                   res.status = 404;
                   nlohmann::json response = {{"success", false},
                                              {"message", "Room not found"}};
                   res.set_content(response.dump(), "application/json");
                   return;
                 }

                 nlohmann::json response = {
                     {"success", true},
                     {"room", room->toJsonWithParticipants()},
                 };
                 res.set_content(response.dump(), "application/json");
               });

  // GET /api/rooms/code/:code - Get room by meeting code
  server_->Get("/api/rooms/code/([^/]+)", [this](const httplib::Request &req,
                                                 httplib::Response &res) {
    std::string meetingCode = req.matches[1];

    auto room = RoomManager::getInstance().getRoomByCode(meetingCode);
    if (!room) {
      res.status = 404;
      nlohmann::json response = {{"success", false},
                                 {"message", "Room not found"}};
      res.set_content(response.dump(), "application/json");
      return;
    }

    nlohmann::json response = {
        {"success", true},
        {"room",
         {
             {"id", room->getId()},
             {"name", room->getName()},
             {"meetingCode", room->getMeetingCode()},
             {"participantCount", room->getParticipantCount()},
         }},
    };
    res.set_content(response.dump(), "application/json");
  });
}

void HttpServer::setupUserRoutes() {
  // GET /api/users/:id - Get user by ID
  server_->Get("/api/users/([^/]+)",
               [this](const httplib::Request &req, httplib::Response &res) {
                 std::string userId = req.matches[1];

                 auto user = UserRepository::getInstance().findById(userId);
                 if (!user) {
                   res.status = 404;
                   nlohmann::json response = {{"success", false},
                                              {"message", "User not found"}};
                   res.set_content(response.dump(), "application/json");
                   return;
                 }

                 nlohmann::json response = {
                     {"success", true},
                     {"user",
                      {{"id", user->id},
                       {"name", user->name},
                       {"avatarUrl", user->avatarUrl}}},
                 };
                 res.set_content(response.dump(), "application/json");
               });
}

} // namespace roaya

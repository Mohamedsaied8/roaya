#include "core/logger.hpp"
#include "room/room_manager.hpp"
#include "signaling/signaling_handler.hpp"
#include "signaling/websocket_server.hpp"
#include <gtest/gtest.h>
#include <nlohmann/json.hpp>

using namespace zoom;

class CreateRoomTest : public ::testing::Test {
protected:
  void SetUp() override {
    Logger::init();

    // Clear RoomManager state for clean test using a dummy cleanup
    auto rooms = RoomManager::getInstance().getAllRooms();
    for (auto &room : rooms) {
      RoomManager::getInstance().deleteRoom(room->getId());
    }

    server = std::make_unique<WebSocketServer>(8081);
    handler = &SignalingHandler::getInstance();
    handler->setWebSocketServer(server.get());

    conn = std::make_shared<WebSocketConnection>();
    conn->id = "conn-123";
    conn->sendCallback = [this](const std::string &msg) {
      lastSentMessage = msg;
    };

    // Register connection in the server so broadcast works if needed
    server->registerConnection(conn->id, conn);
  }

  void TearDown() override { server->unregisterConnection(conn->id); }

  std::unique_ptr<WebSocketServer> server;
  SignalingHandler *handler;
  std::shared_ptr<WebSocketConnection> conn;
  std::string lastSentMessage;
};

TEST_F(CreateRoomTest, HandleCreateRoomCreatesRoomAndSendsResponse) {
  nlohmann::json payload = {{"name", "Test Room"}, {"hostName", "Alice"}};

  SignalingMessage msg;
  msg.type = MessageType::CREATE_ROOM;
  msg.payload = payload;

  // Process message directly
  handler->handleMessage(conn, msg.toString());

  // Verify response was sent
  ASSERT_FALSE(lastSentMessage.empty());

  auto responseJson = nlohmann::json::parse(lastSentMessage);
  EXPECT_EQ(responseJson["type"], "room_created");

  auto responsePayload = responseJson["payload"];
  EXPECT_EQ(responsePayload["name"], "Test Room");

  std::string roomId = responsePayload["id"];
  std::string meetingCode = responsePayload["meetingCode"];
  EXPECT_FALSE(roomId.empty());
  EXPECT_FALSE(meetingCode.empty());

  // Verify room was actually created in standard store
  auto room = RoomManager::getInstance().getRoom(roomId);
  ASSERT_NE(room, nullptr);
  EXPECT_EQ(room->getName(), "Test Room");

  // Verify connection state was updated
  EXPECT_EQ(conn->roomId, roomId);
  EXPECT_FALSE(conn->participantId.empty());

  // Verify participant was added to room
  auto participants = room->getParticipants();
  ASSERT_EQ(participants.size(), 1);
  EXPECT_EQ(participants[0]->getName(), "Alice");
  EXPECT_EQ(participants[0]->getRole(), Participant::Role::HOST);
}

TEST_F(CreateRoomTest, HandleCreateRoomUsesDefaultsIfMissing) {
  nlohmann::json payload = nlohmann::json::object(); // Empty payload

  SignalingMessage msg;
  msg.type = MessageType::CREATE_ROOM;
  msg.payload = payload;

  handler->handleMessage(conn, msg.toString());

  ASSERT_FALSE(lastSentMessage.empty());
  auto responseJson = nlohmann::json::parse(lastSentMessage);
  EXPECT_EQ(responseJson["type"], "room_created");
  EXPECT_EQ(responseJson["payload"]["name"], "Untitled Meeting");

  std::string roomId = responseJson["payload"]["id"];
  auto room = RoomManager::getInstance().getRoom(roomId);
  ASSERT_NE(room, nullptr);
  auto participants = room->getParticipants();
  ASSERT_EQ(participants.size(), 1);
  EXPECT_EQ(participants[0]->getName(), "Host");
}

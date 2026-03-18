#include "core/logger.hpp"
#include "room/room_manager.hpp"
#include "signaling/signaling_handler.hpp"
#include "signaling/websocket_server.hpp"
#include <gtest/gtest.h>
#include <nlohmann/json.hpp>
#include <vector>

using namespace zoom;

class JoinRoomTest : public ::testing::Test {
protected:
  void SetUp() override {
    Logger::init();

    // Clean up completely
    auto rooms = RoomManager::getInstance().getAllRooms();
    for (auto &r : rooms) {
      RoomManager::getInstance().deleteRoom(r->getId());
    }

    server = std::make_unique<WebSocketServer>(8081);
    handler = &SignalingHandler::getInstance();
    handler->setWebSocketServer(server.get());

    // Setup Host Connection
    hostConn = std::make_shared<WebSocketConnection>();
    hostConn->id = "host-conn-1";
    hostConn->sendCallback = [this](const std::string &msg) {
      hostMessages.push_back(msg);
    };
    server->registerConnection(hostConn->id, hostConn);

    // Setup Guest Connection
    guestConn = std::make_shared<WebSocketConnection>();
    guestConn->id = "guest-conn-2";
    guestConn->sendCallback = [this](const std::string &msg) {
      guestMessages.push_back(msg);
    };
    server->registerConnection(guestConn->id, guestConn);

    // Let host create a room first
    nlohmann::json createPayload = {{"name", "Host's Room"},
                                    {"hostName", "Alice"}};
    SignalingMessage createMsg;
    createMsg.type = MessageType::CREATE_ROOM;
    createMsg.payload = createPayload;

    handler->handleMessage(hostConn, createMsg.toString());

    // Extract room info
    ASSERT_FALSE(hostMessages.empty());
    auto response = nlohmann::json::parse(hostMessages.back());
    roomId = response["payload"]["id"];
    meetingCode = response["payload"]["meetingCode"];
    hostMessages.clear(); // clear buffer for next steps
  }

  void TearDown() override {
    server->unregisterConnection(hostConn->id);
    server->unregisterConnection(guestConn->id);
  }

  std::unique_ptr<WebSocketServer> server;
  SignalingHandler *handler;

  std::shared_ptr<WebSocketConnection> hostConn;
  std::shared_ptr<WebSocketConnection> guestConn;

  std::vector<std::string> hostMessages;
  std::vector<std::string> guestMessages;

  std::string roomId;
  std::string meetingCode;
};

// 1. Verify `JOIN_ROOM` messages add participants and respond correctly.
TEST_F(JoinRoomTest, HandleJoinRoomAddsParticipantAndReturnsSuccess) {
  nlohmann::json payload = {{"name", "Bob"}, {"meetingCode", meetingCode}};

  SignalingMessage msg;
  msg.type = MessageType::JOIN_ROOM;
  msg.payload = payload;

  handler->handleMessage(guestConn, msg.toString());

  // Check response to Guest
  ASSERT_FALSE(guestMessages.empty());
  auto guestResp = nlohmann::json::parse(guestMessages.front());
  EXPECT_EQ(guestResp["type"], "room_joined");
  EXPECT_EQ(guestResp["payload"]["id"], roomId);
  EXPECT_EQ(guestResp["payload"]["name"], "Host's Room");

  // Verify Guest conn state
  EXPECT_EQ(guestConn->roomId, roomId);
  EXPECT_FALSE(guestConn->participantId.empty());
}

// 2. Verify `PARTICIPANT_JOINED` broadcast correctly handling exclusion
TEST_F(JoinRoomTest, HandleJoinRoomBroadcastsToOthersExcludingSelf) {
  nlohmann::json payload = {{"name", "Bob"}};

  SignalingMessage msg;
  msg.type = MessageType::JOIN_ROOM;
  msg.roomId = roomId;
  msg.payload = payload;

  handler->handleMessage(guestConn, msg.toString());

  // Check what the host received (should see PARTICIPANT_JOINED)
  ASSERT_FALSE(hostMessages.empty());
  auto hostResp = nlohmann::json::parse(hostMessages.front());
  EXPECT_EQ(hostResp["type"], "participant_joined");
  EXPECT_EQ(hostResp["payload"]["name"], "Bob");

  // Check what the guest received (should NOT receive their own join broadcast!
  // BUG #2 verify) guestMessages should ONLY contain "room_joined", size should
  // be 1
  ASSERT_EQ(guestMessages.size(), 1);
  auto guestResp = nlohmann::json::parse(guestMessages.back());
  EXPECT_EQ(guestResp["type"], "room_joined");
}

// 3. Verify registerParticipantMapping correctly populated in Server (BUG #1
// verify)
TEST_F(JoinRoomTest, VerifyParticipantToConnectionMappingIsPopulated) {
  nlohmann::json payload = {{"name", "Bob"}};

  SignalingMessage msg;
  msg.type = MessageType::JOIN_ROOM;
  msg.roomId = roomId;
  msg.payload = payload;

  handler->handleMessage(guestConn, msg.toString());

  // Try sending a targeted message to the Guest from the Host to test mapping
  // mapping
  SignalingMessage targetMsg;
  targetMsg.type = MessageType::CHAT_MESSAGE;
  targetMsg.senderId = hostConn->participantId;
  targetMsg.targetId =
      guestConn->participantId; // Requires participant connection map to find
                                // guestConn
  targetMsg.roomId = roomId;
  targetMsg.payload = {{"message", "Direct message to Bob!"}};

  // Process and expect message dispatched to guestConn
  handler->handleMessage(hostConn, targetMsg.toString());

  ASSERT_EQ(guestMessages.size(), 2); // 1. room_joined, 2. the target msg
  auto dm = nlohmann::json::parse(guestMessages.back());
  EXPECT_EQ(dm["type"], "chat_message");
  EXPECT_EQ(dm["payload"]["message"], "Direct message to Bob!");
}

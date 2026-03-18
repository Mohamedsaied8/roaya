#include "core/logger.hpp"
#include "room/room_manager.hpp"
#include "signaling/signaling_handler.hpp"
#include "signaling/websocket_server.hpp"
#include <gtest/gtest.h>
#include <nlohmann/json.hpp>
#include <vector>

using namespace zoom;

class WebRTCSignalingTest : public ::testing::Test {
protected:
  void SetUp() override {
    Logger::init();

    // Clean up
    auto rooms = RoomManager::getInstance().getAllRooms();
    for (auto &r : rooms) {
      RoomManager::getInstance().deleteRoom(r->getId());
    }

    server = std::make_unique<WebSocketServer>(8081);
    handler = &SignalingHandler::getInstance();
    handler->setWebSocketServer(server.get());

    hostConn = std::make_shared<WebSocketConnection>();
    hostConn->id = "host-ws";
    hostConn->sendCallback = [this](const std::string &msg) {
      hostMessages.push_back(msg);
    };
    server->registerConnection(hostConn->id, hostConn);

    guestConn = std::make_shared<WebSocketConnection>();
    guestConn->id = "guest-ws";
    guestConn->sendCallback = [this](const std::string &msg) {
      guestMessages.push_back(msg);
    };
    server->registerConnection(guestConn->id, guestConn);

    // Host creates room
    nlohmann::json createPayload = {{"name", "Video Room"},
                                    {"hostName", "HostAlice"}};
    SignalingMessage createMsg;
    createMsg.type = MessageType::CREATE_ROOM;
    createMsg.payload = createPayload;
    handler->handleMessage(hostConn, createMsg.toString());

    auto response = nlohmann::json::parse(hostMessages.back());
    roomId = response["payload"]["id"];
    hostMessages.clear();

    // Guest joins room
    nlohmann::json joinPayload = {{"name", "GuestBob"}};
    SignalingMessage joinMsg;
    joinMsg.type = MessageType::JOIN_ROOM;
    joinMsg.roomId = roomId;
    joinMsg.payload = joinPayload;
    handler->handleMessage(guestConn, joinMsg.toString());

    hostMessages.clear();
    guestMessages.clear();
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
};

// 1. Verify SDP_OFFER is routed correctly
TEST_F(WebRTCSignalingTest, SdpOfferIsRoutedToTarget) {
  nlohmann::json payload = {{"sdp", "v=0\r\no=- 0 0 IN IP4 127.0.0.1..."},
                            {"type", "offer"}};

  SignalingMessage msg;
  msg.type = MessageType::SDP_OFFER;
  msg.roomId = roomId;
  msg.senderId = hostConn->participantId;
  msg.targetId = guestConn->participantId;
  msg.payload = payload;

  handler->handleMessage(hostConn, msg.toString());

  // Verify Guest received the offer
  ASSERT_EQ(guestMessages.size(), 1);
  auto guestResp = nlohmann::json::parse(guestMessages.front());
  EXPECT_EQ(guestResp["type"], "sdp_offer");
  EXPECT_EQ(guestResp["senderId"], hostConn->participantId);
  EXPECT_EQ(guestResp["payload"]["type"], "offer");

  // Verify Host received NOTHING back
  EXPECT_TRUE(hostMessages.empty());
}

// 2. Verify SDP_ANSWER is routed correctly
TEST_F(WebRTCSignalingTest, SdpAnswerIsRoutedToTarget) {
  nlohmann::json payload = {{"sdp", "v=0\r\n..."}, {"type", "answer"}};

  SignalingMessage msg;
  msg.type = MessageType::SDP_ANSWER;
  msg.roomId = roomId;
  msg.senderId = guestConn->participantId;
  msg.targetId = hostConn->participantId;
  msg.payload = payload;

  handler->handleMessage(guestConn, msg.toString());

  // Verify Host received the answer
  ASSERT_EQ(hostMessages.size(), 1);
  auto hostResp = nlohmann::json::parse(hostMessages.front());
  EXPECT_EQ(hostResp["type"], "sdp_answer");
  EXPECT_EQ(hostResp["senderId"], guestConn->participantId);
}

// 3. Verify ICE_CANDIDATE is routed correctly
TEST_F(WebRTCSignalingTest, IceCandidateIsRoutedToTarget) {
  nlohmann::json payload = {{"candidate", "candidate:1 1 UDP ..."},
                            {"sdpMLineIndex", 0},
                            {"sdpMid", "0"}};

  SignalingMessage msg;
  msg.type = MessageType::ICE_CANDIDATE;
  msg.roomId = roomId;
  msg.senderId = hostConn->participantId;
  msg.targetId = guestConn->participantId;
  msg.payload = payload;

  handler->handleMessage(hostConn, msg.toString());

  // Verify Guest received the ICE candidate
  ASSERT_EQ(guestMessages.size(), 1);
  auto guestResp = nlohmann::json::parse(guestMessages.front());
  EXPECT_EQ(guestResp["type"], "ice_candidate");
  EXPECT_EQ(guestResp["senderId"], hostConn->participantId);
  EXPECT_EQ(guestResp["payload"]["candidate"], "candidate:1 1 UDP ...");
}

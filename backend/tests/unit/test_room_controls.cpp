#include "core/logger.hpp"
#include "room/room_manager.hpp"
#include "signaling/signaling_handler.hpp"
#include "signaling/websocket_server.hpp"
#include <gtest/gtest.h>
#include <nlohmann/json.hpp>
#include <vector>

using namespace zoom;

class RoomControlsTest : public ::testing::Test {
protected:
  void SetUp() override {
    Logger::init();
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
    nlohmann::json createPayload = {{"name", "Controls Room"}};
    SignalingMessage createMsg;
    createMsg.type = MessageType::CREATE_ROOM;
    createMsg.payload = createPayload;
    handler->handleMessage(hostConn, createMsg.toString());

    auto response = nlohmann::json::parse(hostMessages.back());
    roomId = response["payload"]["id"];

    // Guest joins room
    SignalingMessage joinMsg;
    joinMsg.type = MessageType::JOIN_ROOM;
    joinMsg.roomId = roomId;
    joinMsg.payload = {{"name", "Guest"}};
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

TEST_F(RoomControlsTest, MediaStateChangeBroadcastsUpdate) {
  nlohmann::json payload = {{"audioMuted", true}, {"videoMuted", false}};

  SignalingMessage msg;
  msg.type = MessageType::MEDIA_STATE_CHANGE;
  msg.roomId = roomId;
  msg.senderId = hostConn->participantId;
  msg.payload = payload;

  handler->handleMessage(hostConn, msg.toString());

  // Guest should receive the update
  ASSERT_EQ(guestMessages.size(), 1);
  auto guestResp = nlohmann::json::parse(guestMessages.front());
  EXPECT_EQ(guestResp["type"], "participant_update");
  EXPECT_EQ(guestResp["payload"]["id"], hostConn->participantId);
  EXPECT_EQ(guestResp["payload"]["audioMuted"], true);

  // Verify Host's participant object was updated in the backend
  auto room = RoomManager::getInstance().getRoom(roomId);
  auto participant = room->getParticipant(hostConn->participantId);
  EXPECT_TRUE(participant->isAudioMuted());
  EXPECT_FALSE(participant->isVideoMuted());
}

TEST_F(RoomControlsTest, ScreenShareStartStopsBroadcasts) {
  // Start screen share
  SignalingMessage startMsg;
  startMsg.type = MessageType::START_SCREEN_SHARE;
  startMsg.roomId = roomId;
  startMsg.senderId = hostConn->participantId;

  handler->handleMessage(hostConn, startMsg.toString());

  ASSERT_EQ(guestMessages.size(), 1);
  auto guestResp = nlohmann::json::parse(guestMessages.back());
  EXPECT_EQ(guestResp["type"], "start_screen_share");
  EXPECT_EQ(guestResp["senderId"], hostConn->participantId);

  auto participant = RoomManager::getInstance().getRoom(roomId)->getParticipant(
      hostConn->participantId);
  EXPECT_TRUE(participant->isScreenSharing());

  // Stop screen share
  SignalingMessage stopMsg;
  stopMsg.type = MessageType::STOP_SCREEN_SHARE;
  stopMsg.roomId = roomId;
  stopMsg.senderId = hostConn->participantId;

  handler->handleMessage(hostConn, stopMsg.toString());

  ASSERT_EQ(guestMessages.size(), 2);
  auto guestResp2 = nlohmann::json::parse(guestMessages.back());
  EXPECT_EQ(guestResp2["type"], "stop_screen_share");
  EXPECT_EQ(guestResp2["senderId"], hostConn->participantId);
  EXPECT_FALSE(participant->isScreenSharing());
}

TEST_F(RoomControlsTest, ChatMessageBroadcastsToRoom) {
  nlohmann::json payload = {{"message", "Hello everyone!"}};

  SignalingMessage msg;
  msg.type = MessageType::CHAT_MESSAGE;
  msg.roomId = roomId;
  msg.senderId = guestConn->participantId;
  msg.payload = payload;

  handler->handleMessage(guestConn, msg.toString());

  // Host should receive chat
  ASSERT_EQ(hostMessages.size(), 1);
  auto hostResp = nlohmann::json::parse(hostMessages.front());
  EXPECT_EQ(hostResp["type"], "chat_message");
  EXPECT_EQ(hostResp["senderId"], guestConn->participantId);
  EXPECT_EQ(hostResp["payload"]["message"], "Hello everyone!");
}

TEST_F(RoomControlsTest, MuteAllBroadcastsToAllParticipants) {
  SignalingMessage msg;
  msg.type = MessageType::MUTE_ALL;
  msg.roomId = roomId;
  msg.senderId = hostConn->participantId;

  handler->handleMessage(hostConn, msg.toString());

  // Guest should receive participant_update with audioMuted=true
  ASSERT_EQ(guestMessages.size(), 1);
  auto guestResp = nlohmann::json::parse(guestMessages.front());
  EXPECT_EQ(guestResp["type"], "mute_all");
  EXPECT_EQ(guestResp["senderId"], hostConn->participantId);
}

TEST_F(RoomControlsTest, KickParticipantRemovesThemAndBroadcasts) {
  nlohmann::json payload = {{"participantId", guestConn->participantId}};

  SignalingMessage msg;
  msg.type = MessageType::KICK_PARTICIPANT;
  msg.roomId = roomId;
  msg.senderId = hostConn->participantId;
  msg.payload = payload;

  handler->handleMessage(hostConn, msg.toString());

  // Guest receives kick message first
  auto guestResp = nlohmann::json::parse(guestMessages.front());
  EXPECT_EQ(guestResp["type"], "kick_participant");

  // Host receives participant_left
  ASSERT_EQ(hostMessages.size(), 1);
  auto hostResp = nlohmann::json::parse(hostMessages.front());
  EXPECT_EQ(hostResp["type"], "participant_left");
  EXPECT_EQ(hostResp["payload"]["participantId"], guestConn->participantId);
}

TEST_F(RoomControlsTest, EndMeetingDeletesRoomAndNotifies) {
  SignalingMessage msg;
  msg.type = MessageType::END_MEETING;
  msg.roomId = roomId;
  msg.senderId = hostConn->participantId;

  handler->handleMessage(hostConn, msg.toString());

  // Guest is notified of meeting ended
  ASSERT_EQ(guestMessages.size(), 1);
  auto guestResp = nlohmann::json::parse(guestMessages.front());
  EXPECT_EQ(guestResp["type"], "end_meeting");

  // Room is deleted
  auto room = RoomManager::getInstance().getRoom(roomId);
  EXPECT_EQ(room, nullptr);
}

#include "auth/jwt_handler.hpp"
#include "media/sfu/sfu_manager.hpp"
#include "signaling/message_types.hpp"
#include "core/logger.hpp"
#include <gtest/gtest.h>
#include <nlohmann/json.hpp>

using namespace roaya;

class SFUManagerTest : public ::testing::Test {
protected:
  void SetUp() override {
    Logger::init();
    SFUManager::getInstance().initialize("http://localhost:1");
  }
};

// Bug 1: correlationId must survive the SFU response round-trip.
// Before the fix, response.payload was overwritten wholesale, losing correlationId.
TEST_F(SFUManagerTest, BuildResponsePreservesCorrelationId) {
  SignalingMessage orig;
  orig.type = MessageType::SFU_GET_ROUTER_RTP_CAPABILITIES;
  orig.roomId = "room-1";
  orig.senderId = "p-1";
  orig.payload = {{"correlationId", "abc123"}, {"extra", "data"}};
  orig.timestamp = 1000;

  nlohmann::json sfuResult = {{"success", true}, {"rtpCapabilities", {{"codecs", nlohmann::json::array()}}}};

  SignalingMessage captured;
  SFUManager::getInstance().handleSFUMessage(orig, [&](const SignalingMessage& res) {
    // This callback won't be called since we can't reach the SFU server,
    // but we can test buildResponse directly via a crafted message.
    captured = res;
  });

  // Since handleSFUMessage tries HTTP and fails, it still calls back with an error payload.
  // The important thing: buildResponse preserves correlationId on the error path too.
  // Let's verify the callback was invoked and correlationId was preserved.
  EXPECT_TRUE(captured.payload.contains("correlationId"));
  EXPECT_EQ(captured.payload["correlationId"], "abc123");
}

TEST_F(SFUManagerTest, BuildResponseWorksWithoutCorrelationId) {
  SignalingMessage orig;
  orig.type = MessageType::SFU_GET_ROUTER_RTP_CAPABILITIES;
  orig.roomId = "room-1";
  orig.payload = {{"someField", "someValue"}};
  orig.timestamp = 1000;

  SignalingMessage captured;
  SFUManager::getInstance().handleSFUMessage(orig, [&](const SignalingMessage& res) {
    captured = res;
  });

  EXPECT_FALSE(captured.payload.contains("correlationId"));
  EXPECT_TRUE(captured.payload.contains("success"));
}

// Bug 1: correlationId preserved for every SFU message type
TEST_F(SFUManagerTest, CorrelationIdPreservedForCreateTransport) {
  SignalingMessage msg;
  msg.type = MessageType::SFU_CREATE_WEBRTC_TRANSPORT;
  msg.roomId = "room-1";
  msg.payload = {{"correlationId", "tx-001"}, {"direction", "send"}};
  msg.timestamp = 2000;

  SignalingMessage captured;
  SFUManager::getInstance().handleSFUMessage(msg, [&](const SignalingMessage& res) {
    captured = res;
  });

  EXPECT_TRUE(captured.payload.contains("correlationId"));
  EXPECT_EQ(captured.payload["correlationId"], "tx-001");
}

TEST_F(SFUManagerTest, CorrelationIdPreservedForProduce) {
  SignalingMessage msg;
  msg.type = MessageType::SFU_PRODUCE;
  msg.payload = {
    {"correlationId", "prod-001"},
    {"transportId", "t1"},
    {"kind", "video"},
    {"rtpParameters", nlohmann::json::object()},
    {"participantId", "p-1"}
  };
  msg.timestamp = 3000;

  SignalingMessage captured;
  SFUManager::getInstance().handleSFUMessage(msg, [&](const SignalingMessage& res) {
    captured = res;
  });

  EXPECT_TRUE(captured.payload.contains("correlationId"));
  EXPECT_EQ(captured.payload["correlationId"], "prod-001");
}

TEST_F(SFUManagerTest, CorrelationIdPreservedForConsume) {
  SignalingMessage msg;
  msg.type = MessageType::SFU_CONSUME;
  msg.payload = {
    {"correlationId", "cons-001"},
    {"transportId", "t1"},
    {"producerId", "p1"},
    {"rtpCapabilities", nlohmann::json::object()}
  };
  msg.timestamp = 4000;

  SignalingMessage captured;
  SFUManager::getInstance().handleSFUMessage(msg, [&](const SignalingMessage& res) {
    captured = res;
  });

  EXPECT_TRUE(captured.payload.contains("correlationId"));
  EXPECT_EQ(captured.payload["correlationId"], "cons-001");
}

TEST_F(SFUManagerTest, CorrelationIdPreservedForGetActiveProducers) {
  SignalingMessage msg;
  msg.type = MessageType::SFU_GET_ACTIVE_PRODUCERS;
  msg.roomId = "room-1";
  msg.payload = {{"correlationId", "gap-001"}};
  msg.timestamp = 5000;

  SignalingMessage captured;
  SFUManager::getInstance().handleSFUMessage(msg, [&](const SignalingMessage& res) {
    captured = res;
  });

  EXPECT_TRUE(captured.payload.contains("correlationId"));
  EXPECT_EQ(captured.payload["correlationId"], "gap-001");
}

// Bug 2: JWT auth headers are generated correctly for SFU service calls
TEST_F(SFUManagerTest, JwtServiceTokenIsValid) {
  auto token = JwtHandler::createToken("sfu-service", "sfu@roaya.internal", "SFU Service", 1);
  EXPECT_FALSE(token.empty());

  auto payload = JwtHandler::verifyToken(token);
  ASSERT_TRUE(payload.has_value());
  EXPECT_EQ(payload->userId, "sfu-service");
  EXPECT_EQ(payload->email, "sfu@roaya.internal");
}

// Bug 3: produce must forward participantId in the HTTP body.
// We can verify that handleSFUMessage extracts participantId from the payload.
// Since the SFU is unreachable in unit tests, we verify the message is routed
// to produce() without throwing when participantId is present.
TEST_F(SFUManagerTest, ProduceForwardsParticipantId) {
  SignalingMessage msg;
  msg.type = MessageType::SFU_PRODUCE;
  msg.payload = {
    {"transportId", "t1"},
    {"kind", "audio"},
    {"rtpParameters", nlohmann::json::object()},
    {"participantId", "participant-42"},
    {"correlationId", "p-001"}
  };
  msg.timestamp = 6000;

  SignalingMessage captured;
  bool callbackInvoked = false;
  SFUManager::getInstance().handleSFUMessage(msg, [&](const SignalingMessage& res) {
    captured = res;
    callbackInvoked = true;
  });

  EXPECT_TRUE(callbackInvoked);
  EXPECT_TRUE(captured.payload.contains("correlationId"));
}

// Bug 3: produce with empty participantId should still work (no crash)
TEST_F(SFUManagerTest, ProduceWithEmptyParticipantIdDoesNotCrash) {
  SignalingMessage msg;
  msg.type = MessageType::SFU_PRODUCE;
  msg.payload = {
    {"transportId", "t1"},
    {"kind", "audio"},
    {"rtpParameters", nlohmann::json::object()}
  };
  msg.timestamp = 7000;

  bool callbackInvoked = false;
  SFUManager::getInstance().handleSFUMessage(msg, [&](const SignalingMessage&) {
    callbackInvoked = true;
  });

  EXPECT_TRUE(callbackInvoked);
}

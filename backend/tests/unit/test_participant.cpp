#include <gtest/gtest.h>
#include "room/participant.hpp"

namespace roaya {

class ParticipantTest : public ::testing::Test {
protected:
    void SetUp() override {
        participant = std::make_unique<Participant>("p-123", "Alice");
    }

    std::unique_ptr<Participant> participant;
};

TEST_F(ParticipantTest, ConstructorSetsInitialValues) {
    EXPECT_EQ(participant->getId(), "p-123");
    EXPECT_EQ(participant->getName(), "Alice");
    EXPECT_EQ(participant->getRole(), Participant::Role::PARTICIPANT);
    EXPECT_TRUE(participant->isAudioMuted());
    EXPECT_TRUE(participant->isVideoMuted());
    EXPECT_FALSE(participant->isScreenSharing());
    EXPECT_FALSE(participant->isHandRaised());
}

TEST_F(ParticipantTest, GettersAndSettersWork) {
    participant->setName("Bob");
    EXPECT_EQ(participant->getName(), "Bob");

    participant->setUserId("user-456");
    EXPECT_EQ(participant->getUserId(), "user-456");

    participant->setRole(Participant::Role::HOST);
    EXPECT_EQ(participant->getRole(), Participant::Role::HOST);

    participant->setAudioMuted(false);
    EXPECT_FALSE(participant->isAudioMuted());

    participant->setVideoMuted(false);
    EXPECT_FALSE(participant->isVideoMuted());

    participant->setScreenSharing(true);
    EXPECT_TRUE(participant->isScreenSharing());

    participant->setHandRaised(true);
    EXPECT_TRUE(participant->isHandRaised());

    participant->setConnectionId("conn-1");
    EXPECT_EQ(participant->getConnectionId(), "conn-1");
}

TEST_F(ParticipantTest, ToJsonContainsAllFields) {
    participant->setUserId("user-1");
    participant->setRole(Participant::Role::CO_HOST);
    participant->setAudioMuted(false);
    
    auto json = participant->toJson();
    
    EXPECT_EQ(json["id"], "p-123");
    EXPECT_EQ(json["name"], "Alice");
    EXPECT_EQ(json["userId"], "user-1");
    EXPECT_EQ(json["role"], "co_host");
    EXPECT_FALSE(json["audioMuted"]);
    EXPECT_TRUE(json["videoMuted"]);
    EXPECT_FALSE(json["screenSharing"]);
    EXPECT_FALSE(json["handRaised"]);
}

} // namespace roaya

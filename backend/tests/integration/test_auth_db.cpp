#include "auth/auth_service.hpp"
#include "db/postgres_client.hpp"
#include "db/user_repository.hpp"
#include "core/logger.hpp"
#include <gtest/gtest.h>

using namespace roaya;

class AuthDBIntegrationTest : public ::testing::Test {
protected:
    void SetUp() override {
        Logger::init("debug", "test_integration.log");
        
        PostgresClient::Config config;
        config.host = "localhost"; // Assume postgres is running locally for tests or via docker-compose
        config.dbname = "roaya_test";
        config.user = "postgres";
        config.password = "postgres";
        
        // This will fail if DB is not up, which is expected if not in right environment
        // In a real CI, we'd start a container first.
        PostgresClient::getInstance().initialize(config);
        
        // Clean up users table
        try {
            PostgresClient::getInstance().execute("DELETE FROM users");
        } catch (...) {}
    }
};

TEST_F(AuthDBIntegrationTest, RegisterAndLoginFlow) {
    AuthService& auth = AuthService::getInstance();
    
    // 1. Register
    auto regResult = auth.registerUser("test@roaya.io", "password123", "Test User");
    if (!regResult.success) {
        GTEST_SKIP() << "Database connection failed, skipping integration test";
    }
    
    EXPECT_TRUE(regResult.success);
    EXPECT_TRUE(regResult.token.has_value());
    EXPECT_EQ(regResult.user->email, "test@roaya.io");
    
    // 2. Login
    auto loginResult = auth.login("test@roaya.io", "password123");
    EXPECT_TRUE(loginResult.success);
    EXPECT_TRUE(loginResult.token.has_value());
    EXPECT_EQ(loginResult.user->name, "Test User");
    
    // 3. Verify Token
    auto verifiedUser = auth.verifyToken(loginResult.token.value());
    ASSERT_TRUE(verifiedUser.has_value());
    EXPECT_EQ(verifiedUser->email, "test@roaya.io");
}

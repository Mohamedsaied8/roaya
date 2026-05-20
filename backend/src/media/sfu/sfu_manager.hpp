#pragma once

#include "signaling/message_types.hpp"
#include <string>
#include <functional>
#include <nlohmann/json.hpp>

namespace roaya {

/**
 * Manages communication with the external SFU service (Node.js/mediasoup)
 */
class SFUManager {
public:
    static SFUManager& getInstance();

    // Initialize connection to SFU service
    void initialize(const std::string& sfuUrl);

    // High-level API for SignalingHandler
    void handleSFUMessage(const SignalingMessage& msg, 
                         std::function<void(const SignalingMessage&)> responseCallback);

private:
    SFUManager() = default;
    std::string sfuUrl_;

    void buildResponse(const SignalingMessage& orig, const nlohmann::json& sfuResult,
                       std::function<void(const SignalingMessage&)> callback);
    
    // Internal methods for specific SFU operations
    void getRouterRtpCapabilities(const std::string& roomId, 
                                 std::function<void(const nlohmann::json&)> callback);
    void createWebRtcTransport(const std::string& roomId, const std::string& direction,
                              std::function<void(const nlohmann::json&)> callback);
    void connectWebRtcTransport(const std::string& transportId, const nlohmann::json& dtlsParameters,
                               std::function<void(const nlohmann::json&)> callback);
    void produce(const std::string& transportId, const std::string& kind, const nlohmann::json& rtpParameters,
                const std::string& participantId, const std::string& source,
                std::function<void(const nlohmann::json&)> callback);
    void consume(const std::string& transportId, const std::string& producerId, const nlohmann::json& rtpCapabilities,
                std::function<void(const nlohmann::json&)> callback);
    void getActiveProducers(const std::string& roomId,
                           std::function<void(const nlohmann::json&)> callback);
    void closeProducer(const std::string& producerId,
                      std::function<void(const nlohmann::json&)> callback);
};

} // namespace roaya

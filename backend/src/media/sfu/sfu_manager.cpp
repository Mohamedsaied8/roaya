#include "sfu_manager.hpp"
#include "core/logger.hpp"
#include <nlohmann/json.hpp>
#include <httplib.h>

namespace roaya {

SFUManager& SFUManager::getInstance() {
    static SFUManager instance;
    return instance;
}

void SFUManager::initialize(const std::string& sfuUrl) {
    sfuUrl_ = sfuUrl;
    LOG_INFO("SFUManager initialized with URL: {}", sfuUrl_);
}

void SFUManager::handleSFUMessage(const SignalingMessage& msg, 
                                 std::function<void(const SignalingMessage&)> responseCallback) {
    switch (msg.type) {
        case MessageType::SFU_GET_ROUTER_RTP_CAPABILITIES:
            getRouterRtpCapabilities(msg.roomId, [msg, responseCallback](const nlohmann::json& res) {
                SignalingMessage response = msg;
                response.payload = res;
                responseCallback(response);
            });
            break;
        case MessageType::SFU_CREATE_WEBRTC_TRANSPORT:
            createWebRtcTransport(msg.roomId, msg.payload.value("direction", "send"), [msg, responseCallback](const nlohmann::json& res) {
                SignalingMessage response = msg;
                response.payload = res;
                responseCallback(response);
            });
            break;
        case MessageType::SFU_CONNECT_WEBRTC_TRANSPORT:
            connectWebRtcTransport(msg.payload["transportId"].get<std::string>(), msg.payload["dtlsParameters"], [msg, responseCallback](const nlohmann::json& res) {
                SignalingMessage response = msg;
                response.payload = res;
                responseCallback(response);
            });
            break;
        case MessageType::SFU_PRODUCE:
            produce(msg.payload["transportId"].get<std::string>(), msg.payload["kind"].get<std::string>(), msg.payload["rtpParameters"], [msg, responseCallback](const nlohmann::json& res) {
                SignalingMessage response = msg;
                response.payload = res;
                responseCallback(response);
            });
            break;
        case MessageType::SFU_CONSUME:
            consume(msg.payload["transportId"].get<std::string>(), msg.payload["producerId"].get<std::string>(), msg.payload["rtpCapabilities"], [msg, responseCallback](const nlohmann::json& res) {
                SignalingMessage response = msg;
                response.payload = res;
                responseCallback(response);
            });
            break;
        default:
            LOG_WARN("Unhandled SFU message type: {}", static_cast<int>(msg.type));
            break;
    }
}

void SFUManager::getRouterRtpCapabilities(const std::string& roomId, 
                                         std::function<void(const nlohmann::json&)> callback) {
    httplib::Client cli(sfuUrl_);
    nlohmann::json body = {{"roomId", roomId}};
    
    auto res = cli.Post("/get_router_rtp_capabilities", body.dump(), "application/json");
    if (res && res->status == 200) {
        callback(nlohmann::json::parse(res->body));
    } else {
        LOG_ERROR("Failed to get SFU router capabilities for room: {}", roomId);
        callback({{"success", false}, {"error", "SFU communication error"}});
    }
}

void SFUManager::createWebRtcTransport(const std::string& roomId, const std::string& direction,
                                      std::function<void(const nlohmann::json&)> callback) {
    httplib::Client cli(sfuUrl_);
    nlohmann::json body = {{"roomId", roomId}, {"direction", direction}};
    
    auto res = cli.Post("/create_webrtc_transport", body.dump(), "application/json");
    if (res && res->status == 200) {
        callback(nlohmann::json::parse(res->body));
    } else {
        LOG_ERROR("Failed to create SFU transport for room: {}", roomId);
        callback({{"success", false}, {"error", "SFU communication error"}});
    }
}

void SFUManager::connectWebRtcTransport(const std::string& transportId, const nlohmann::json& dtlsParameters,
                                       std::function<void(const nlohmann::json&)> callback) {
    httplib::Client cli(sfuUrl_);
    nlohmann::json body = {{"transportId", transportId}, {"dtlsParameters", dtlsParameters}};
    
    auto res = cli.Post("/connect_webrtc_transport", body.dump(), "application/json");
    if (res && res->status == 200) {
        callback(nlohmann::json::parse(res->body));
    } else {
        LOG_ERROR("Failed to connect SFU transport: {}", transportId);
        callback({{"success", false}, {"error", "SFU communication error"}});
    }
}

void SFUManager::produce(const std::string& transportId, const std::string& kind, const nlohmann::json& rtpParameters,
                        std::function<void(const nlohmann::json&)> callback) {
    httplib::Client cli(sfuUrl_);
    nlohmann::json body = {{"transportId", transportId}, {"kind", kind}, {"rtpParameters", rtpParameters}};
    
    auto res = cli.Post("/produce", body.dump(), "application/json");
    if (res && res->status == 200) {
        callback(nlohmann::json::parse(res->body));
    } else {
        LOG_ERROR("Failed to produce on SFU: {}", transportId);
        callback({{"success", false}, {"error", "SFU communication error"}});
    }
}

void SFUManager::consume(const std::string& transportId, const std::string& producerId, const nlohmann::json& rtpCapabilities,
                        std::function<void(const nlohmann::json&)> callback) {
    httplib::Client cli(sfuUrl_);
    nlohmann::json body = {{"transportId", transportId}, {"producerId", producerId}, {"rtpCapabilities", rtpCapabilities}};
    
    auto res = cli.Post("/consume", body.dump(), "application/json");
    if (res && res->status == 200) {
        callback(nlohmann::json::parse(res->body));
    } else {
        LOG_ERROR("Failed to consume on SFU: {}", transportId);
        callback({{"success", false}, {"error", "SFU communication error"}});
    }
}

} // namespace roaya

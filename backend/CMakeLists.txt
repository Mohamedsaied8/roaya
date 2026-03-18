cmake_minimum_required(VERSION 3.20)
project(ZoomLikeApp VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Build options
option(BUILD_TESTS "Build unit and integration tests" ON)
option(BUILD_DOCS "Build documentation" OFF)
option(USE_ASAN "Use AddressSanitizer" OFF)
option(USE_TSAN "Use ThreadSanitizer" OFF)

if(USE_ASAN)
    add_compile_options(-fsanitize=address -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address)
elseif(USE_TSAN)
    add_compile_options(-fsanitize=thread)
    add_link_options(-fsanitize=thread)
endif()

# Output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Find required packages
find_package(Threads REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(ZLIB REQUIRED)

# Include FetchContent for dependency management
include(FetchContent)

# =====================
# External Dependencies
# =====================

# nlohmann/json
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# spdlog (fast logging)
FetchContent_Declare(
    spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog.git
    GIT_TAG v1.13.0
)
FetchContent_MakeAvailable(spdlog)

# jwt-cpp (JWT authentication)
FetchContent_Declare(
    jwt-cpp
    GIT_REPOSITORY https://github.com/Thalhammer/jwt-cpp.git
    GIT_TAG v0.7.0
)
FetchContent_MakeAvailable(jwt-cpp)

# uWebSockets - high-performance WebSocket library
FetchContent_Declare(
    uwebsockets
    GIT_REPOSITORY https://github.com/uNetworking/uWebSockets.git
    GIT_TAG v20.60.0
)
FetchContent_MakeAvailable(uwebsockets)

# uSockets (required by uWebSockets)
FetchContent_Declare(
    usockets
    GIT_REPOSITORY https://github.com/uNetworking/uSockets.git
    GIT_TAG v0.8.8
)
FetchContent_MakeAvailable(usockets)

# cpp-httplib - lightweight HTTP server
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.14.3
)
FetchContent_MakeAvailable(httplib)

# argon2 - password hashing
FetchContent_Declare(
    argon2
    GIT_REPOSITORY https://github.com/P-H-C/phc-winner-argon2.git
    GIT_TAG 20190702
)
FetchContent_MakeAvailable(argon2)

# libpqxx - PostgreSQL C++ client
FetchContent_Declare(
    libpqxx
    GIT_REPOSITORY https://github.com/jtv/libpqxx.git
    GIT_TAG 7.9.1
)
FetchContent_MakeAvailable(libpqxx)

file(GLOB USOCKETS_SOURCES
    ${usockets_SOURCE_DIR}/src/*.c
    ${usockets_SOURCE_DIR}/src/eventing/*.c
    ${usockets_SOURCE_DIR}/src/crypto/*.c
    ${usockets_SOURCE_DIR}/src/crypto/*.cpp
)

add_library(usockets STATIC ${USOCKETS_SOURCES})
target_compile_definitions(usockets PRIVATE LIBUS_USE_OPENSSL)
target_include_directories(usockets PUBLIC ${usockets_SOURCE_DIR}/src)
target_link_libraries(usockets PUBLIC OpenSSL::SSL OpenSSL::Crypto ZLIB::ZLIB)

# =====================
# Source Files
# =====================

set(CORE_SOURCES
    src/core/server.cpp
    src/core/config.cpp
    src/core/logger.cpp
    src/core/worker_thread.cpp
    src/core/signal_handler.cpp
)

set(SIGNALING_SOURCES
    src/signaling/websocket_server.cpp
    src/signaling/signaling_handler.cpp
)

set(API_SOURCES
    src/api/http_server.cpp
)

set(ROOM_SOURCES
    src/room/room_manager.cpp
    src/room/room.cpp
    src/room/participant.cpp
)

set(AUTH_SOURCES
    src/auth/auth_service.cpp
    src/auth/jwt_handler.cpp
    src/auth/password_hasher.cpp
)

set(CHAT_SOURCES
    src/chat/chat_handler.cpp
)

set(DATABASE_SOURCES
    src/db/user_repository.cpp
    src/db/redis_client.cpp
    src/db/postgres_client.cpp
)

set(ALL_SOURCES
    ${CORE_SOURCES}
    ${SIGNALING_SOURCES}
    ${API_SOURCES}
    ${ROOM_SOURCES}
    ${AUTH_SOURCES}
    ${CHAT_SOURCES}
    ${DATABASE_SOURCES}
)

# =====================
# Main Library
# =====================

add_library(roaya_lib STATIC ${ALL_SOURCES})

target_include_directories(roaya_lib PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${uwebsockets_SOURCE_DIR}/src
    ${usockets_SOURCE_DIR}/src
    ${httplib_SOURCE_DIR}
)

target_link_libraries(roaya_lib PUBLIC
    Threads::Threads
    OpenSSL::SSL
    OpenSSL::Crypto
    nlohmann_json::nlohmann_json
    spdlog::spdlog_header_only
    jwt-cpp::jwt-cpp
    usockets
    ZLIB::ZLIB
    pqxx::pqxx
    argon2
)



# =====================
# Main Executable
# =====================

add_executable(roaya_server src/main.cpp)
target_link_libraries(roaya_server PRIVATE roaya_lib)

# =====================
# Tests
# =====================

if(BUILD_TESTS)
    enable_testing()
    
    # Google Test
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.14.0
    )
    FetchContent_MakeAvailable(googletest)
    
    # Test source files
    add_executable(unit_tests 
        tests/unit/test_main.cpp
        tests/unit/test_create_room.cpp
        tests/unit/test_join_room.cpp
        tests/unit/test_webrtc_signaling.cpp
        tests/unit/test_room_controls.cpp
        tests/unit/test_concurrency.cpp
        tests/unit/test_task_queue.cpp
        tests/unit/test_worker_thread.cpp
    )
    target_link_libraries(unit_tests PRIVATE roaya_lib GTest::gtest_main GTest::gmock GTest::gmock_main)
    include(GoogleTest)
    gtest_discover_tests(unit_tests)

    add_executable(test_auth_db tests/integration/test_auth_db.cpp)
    target_link_libraries(test_auth_db PRIVATE roaya_lib GTest::gtest_main)
    gtest_discover_tests(test_auth_db)
endif()

# =====================
# Installation
# =====================

install(TARGETS roaya_server
    RUNTIME DESTINATION bin
)

install(DIRECTORY include/roaya
    DESTINATION include
)

# =====================
# Package Configuration
# =====================

set(CPACK_PACKAGE_NAME "RoayaApp")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_PACKAGE_DESCRIPTION "High-performance video conferencing server")
include(CPack)

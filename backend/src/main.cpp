#include "core/logger.hpp"
#include "core/server.hpp"
#include <cstdlib>
#include <iostream>

int main(int argc, char *argv[]) {
  std::string configPath = "config/config.json";

  // Parse command line arguments
  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if ((arg == "-c" || arg == "--config") && i + 1 < argc) {
      configPath = argv[++i];
    } else if (arg == "-h" || arg == "--help") {
      std::cout << "Zoom-Like Video Conferencing Server\n"
                << "Usage: " << argv[0] << " [options]\n"
                << "Options:\n"
                << "  -c, --config <path>  Path to config file (default: "
                   "config/config.json)\n"
                << "  -h, --help           Show this help message\n";
      return 0;
    }
  }

  try {
    zoom::Server server;

    if (!server.initialize(configPath)) {
      std::cerr << "Failed to initialize server" << std::endl;
      return 1;
    }

    // Run the server (blocking)
    server.run();

    return 0;

  } catch (const std::exception &e) {
    std::cerr << "Fatal error: " << e.what() << std::endl;
    return 1;
  }
}

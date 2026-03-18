#include "core/task_queue.hpp"
#include "core/worker_thread.hpp"
#include "core/logger.hpp"
#include <gtest/gtest.h>
#include <atomic>
#include <chrono>
#include <vector>
#include <thread>
#include <memory>

using namespace roaya;

class ConcurrencyTest : public ::testing::Test {
protected:
  void SetUp() override {
    static bool initialized = false;
    if (!initialized) {
        Logger::init("debug", "test_roaya.log");
        initialized = true;
    }
  }
};

TEST_F(ConcurrencyTest, TaskQueuePushPop) {
  TaskQueue queue;
  std::atomic<bool> executed{false};

  queue.push([&executed]() {
    executed = true;
  });

  EXPECT_EQ(queue.size(), 1);
  EXPECT_FALSE(queue.empty());

  auto task = queue.pop();
  ASSERT_NE(task, nullptr);
  task();

  EXPECT_TRUE(executed);
  EXPECT_EQ(queue.size(), 0);
  EXPECT_TRUE(queue.empty());
}

TEST_F(ConcurrencyTest, WorkerThreadProcessesTasks) {
  TaskQueue queue;
  WorkerThread worker(queue);
  
  std::atomic<int> counter{0};
  const int numTasks = 10;

  worker.start();

  for (int i = 0; i < numTasks; ++i) {
    queue.push([&counter]() {
      counter++;
    });
  }

  // Give some time for tasks to process
  int attempts = 0;
  while (counter < numTasks && attempts < 100) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    attempts++;
  }

  EXPECT_EQ(counter.load(), numTasks);
  
  worker.stop();
  EXPECT_FALSE(worker.isRunning());
}

TEST_F(ConcurrencyTest, TaskQueueStopWakesUpPop) {
  TaskQueue queue;
  std::atomic<bool> finished{false};

  std::thread t([&queue, &finished]() {
    auto task = queue.pop();
    EXPECT_EQ(task, nullptr);
    finished = true;
  });

  std::this_thread::sleep_for(std::chrono::milliseconds(50));
  queue.stop();

  t.join();
  EXPECT_TRUE(finished);
}

TEST_F(ConcurrencyTest, MultipleWorkers) {
  TaskQueue queue;
  const int numWorkers = 4;
  std::vector<std::unique_ptr<WorkerThread>> workers;
  
  for (int i = 0; i < numWorkers; ++i) {
    workers.push_back(std::make_unique<WorkerThread>(queue));
    workers.back()->start();
  }

  std::atomic<int> counter{0};
  const int numTasks = 100;

  for (int i = 0; i < numTasks; ++i) {
    queue.push([&counter]() {
      counter++;
    });
  }

  int attempts = 0;
  while (counter < numTasks && attempts < 100) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    attempts++;
  }

  EXPECT_EQ(counter.load(), numTasks);

  queue.stop();
  for (auto &worker : workers) {
    worker->stop();
  }
}

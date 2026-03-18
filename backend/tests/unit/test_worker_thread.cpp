#include "core/worker_thread.hpp"
#include "core/task_queue.hpp"
#include <gtest/gtest.h>
#include <chrono>
#include <atomic>

using namespace roaya;

TEST(WorkerThreadTest, ProcessTasks) {
    TaskQueue queue;
    WorkerThread worker(queue);
    
    std::atomic<int> result{0};
    
    worker.start();
    
    queue.push([&result]() { result = 42; });
    
    // Give it some time to process
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    
    EXPECT_EQ(result, 42);
    
    worker.stop();
}

TEST(WorkerThreadTest, SafeShutdown) {
    TaskQueue queue;
    {
        WorkerThread worker(queue);
        worker.start();
        queue.push([]() { std::this_thread::sleep_for(std::chrono::milliseconds(10)); });
    } // worker destructor calls stop()
    
    EXPECT_TRUE(true); // Should not hang
}

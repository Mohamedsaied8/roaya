# Detailed Implementation Roadmap: Roaya (Vision)

This document provides a granular, step-by-step breakdown of the development process for **Roaya**. Every task follows the strict **Definition of Done** outlined below.

## Definition of Done (DoD)
To ensure high quality and prevent regression, a feature is considered "Done" only when:
1.  **Implementation**: The feature is fully implemented according to the architectural spec.
2.  **Unit Testing**: 100% test coverage is achieved for all new core logic.
3.  **Integration/Acceptance**: GUI and communication paths are verified via integration/E2E tests (Playwright/Jest).
4.  **Version Control**: Code is pushed to a GitHub repository within a dedicated **Pull Request**.
5.  **CI/CD Validation**: The Jenkins pipeline runs successfully, ensuring zero regressions and 100% passing tests.
6.  **Peer Review**: Code is reviewed, approved, and merged by a collaborator.

---

## Phase 1: CI/CD, Containerization & Environment
*Goal: Establish the automated build, test, and deployment foundation.*

### 1.1 Dockerization
- [ ] **Backend (C++)**:
    - [ ] Create a Multi-stage `Dockerfile` (Build vs Runtime).
    - [ ] Configure `docker-compose.yml` for local development (Backend, Postgres, Redis, Coturn).
- [ ] **Frontend (React/TS)**:
    - [ ] Create a `Dockerfile` for the frontend (Build vs NGINX Runtime).
- [ ] **SFU Worker**:
    - [ ] Containerize the `mediasoup-worker` independent service.

### 1.2 Local Jenkins CI/CD
- [ ] **Jenkins Setup**:
    - [ ] Install Jenkins locally (Docker or Host-based).
    - [ ] Configure **GitHub Plugin** and **GitHub Status API** credentials.
- [ ] **Pipeline Configuration**:
    - [ ] Define `Jenkinsfile` with the following mandatory stages:
        - [ ] **Build**: Compile C++ backend and Frontend assets.
        - [ ] **Unit testing**: Run `GoogleTest` and `Vitest` unit suites.
        - [ ] **Integration testing**: Verify DB connections and WebSocket signaling.
        - [ ] **Acceptance testing**: Execute E2E Playwright scenarios.
- [ ] **GitHub Feedback**:
    - [ ] Configure `post`-build actions to update the GitHub Pull Request status (Success/Failure) via the Status API.

### 1.3 Testing Foundation
- [ ] Set up **Sanitizers** (ASan, TSan) in the C++ build for early memory/race detection.
- [ ] Configure **Client-side E2E test runner** (Playwright or Cypress) in the CI pipeline.

---

## Phase 2: Foundation & Authentication
*Goal: Secure user identity and core backend scaffolding with integrated tests.*

### 2.1 Backend & Concurrency Scaffolding
- [ ] Set up CMake with strict warnings and **Signal Handler Abstraction**.
- [ ] Implement `TaskQueue` and `WorkerThread` classes.
- [ ] **Test**: Unit test `TaskQueue` for thread-safety and `WorkerThread` for message processing.

### 2.2 Database & Authentication
- [ ] Define Postgres schemas and implement `PostgresClient`.
- [ ] Implement `AuthService` (Register/Login) with Argon2id.
- [ ] **Test**: Integration tests for DB CRUD and Auth logic (mocking Postgres).

### 2.3 Frontend Foundation
- [ ] Scaffold Vite/Tailwind/Lucide project.
- [ ] Implement `AuthStore` and Auth UI components.
- [ ] **Test**: Unit tests for `AuthStore` and Component tests for Login forms.

---

## Phase 3: Signaling & Room Management
*Goal: Real-time orchestration and meeting lifecycle.*

### 3.1 WebSocket Core & Lock-Free Signaling
- [ ] Implement `WebSocketServer` and `SignalMessage` JSON envelope.
- [ ] Implement **Lock-Free SPSC Queues** for IO-to-Room communication.
- [ ] **Test**: Load test the WebSocket server for 1000+ concurrent connections.

### 3.2 Room Logic, Lifecycle & RBAC
- [ ] Implement `RoomManager` with **Thread Pinning** and **Auth Enforcement**.
- [ ] Implement Host Controls (Mute/Kick/Permissions) with backend validation.
- [ ] **Test**: Scenario-based tests for Host actions (e.g., "Non-host cannot kick").

### 3.3 Roaya Branding & Participant UI
- [ ] Design and implement the **Roaya Logo** (Vision-themed, clean typography) for the header.
- [ ] Build **Icon-Only Participant Menu** (🔇, ⛔, 🖥️).
- [ ] **Test**: UI/UX tests for logo responsiveness and permission toggles.

---

## Phase 4: WebRTC Media & Advanced Features
*Goal: High-performance audio/video routing and interactive tools.*

### 4.1 Media Server (SFU) Integration
- [ ] Integrate `mediasoup-worker` and implement `SFUManager`.
- [ ] **Test**: Media integration tests (simulated RTP packet forwarding).

### 4.2 Screen Sharing & Remote Control
- [ ] Implement `getDisplayMedia` and SFU optimization for screens.
- [ ] Implement **WebRTC DataChannels** for Remote Control event transmission.
- [ ] **Test**: Latency measurements for Remote Control input events.

### 4.3 Media UI
- [ ] Build responsive Masonry `VideoGrid` and Active Speaker detection.
- [ ] **Test**: Cross-browser testing for WebRTC compatibility (Chrome/Firefox/Safari).

---

## Phase 5: Recording & Storage
*Goal: Persistent meeting capture and cloud offloading.*

### 5.1 Server-Side Recording
- [ ] Implement Headless Recording Engine (Puppeteer/FFmpeg).
- [ ] **Test**: Automated validation of generated MP4 files (bitrate, duration).

### 5.2 Dynamic Google Drive Integration
- [ ] Implement `StorageSettings` API and Frontend **Settings GUI**.
- [ ] Implement OAuth2 refresh token flow for Drive.
- [ ] **Test**: Mocked Google API integration tests for chunked multi-part uploads.

---

## Phase 6: Scheduling & Calendar
*Goal: Future planning and external sync.*

### 6.1 Internal Scheduler & Lifecycle Auth
- [ ] Implement `scheduledAt` logic and **Lifecycle Auth** guards.
- [ ] **Test**: Timezone-aware unit tests for scheduling logic.

### 6.2 Google Calendar Sync
- [ ] Implement Google Calendar API sync and "Add to Calendar" buttons.
- [ ] **Test**: End-to-end flow from "Schedule Meeting" to "Calendar Event Created".

---

## Phase 7: Production Hardening & Scaling
*Goal: Stability and stress-testing at scale.*

- [ ] **Load Balancing**: NGINX sticky sessions and **Coturn** deployment.
- [ ] **Stress Test**: Simulate 50+ concurrent participants with multiple media tracks and recording active.
- [ ] **Stability**: 24-hour soak test to find memory leaks and socket pool exhaustion.
- [ ] **Final QA**: Full manual walkthrough of all "Host Control" icons and "Remote Control" sessions.

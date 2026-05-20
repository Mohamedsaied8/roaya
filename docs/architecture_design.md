# Roaya (Vision) - Production-Grade Architecture Design

## 1. System Overview

### High-Level Components

*   **API & Signaling Edge (C++ Backend)**: Terminates HTTP/WebSocket traffic. Routes signaling and manages room state.
*   **Authentication Service**: JWT-based identity management (Argon2 hashing).
*   **Media Server / SFU (C++ Backend)**: Real-time RTP routing and encryption (DTLS/SRTP).
*   **Recording Engine**: Headless compositing and streaming to local/cloud storage.
*   **Scheduling Service**: Future meeting persistence and Google Calendar synchronization.
*   **Frontend Client (React/TS)**: Responsive UI with integrated WebRTC stack and host control icons.
*   **External APIs**: **Google Drive** (Recordings) and **Google Calendar** (Scheduling).
*   **Infrastructure**: **Redis** (State), **PostgreSQL** (Persistence), **Coturn** (STUN/TURN).

**Decision:** Co-locate Signaling and SFU logic on the same C++ tier but decouple them via distinct thread pools and message queues.
— **Rationale:** Reduces network hops between signaling and media provisioning, lowering stream startup latency. The existing C++ backend handles both HTTP and WebSockets, so keeping them together satisfies the stack constraint while utilizing C++'s performance.
— **Tradeoff:** A crash in the experimental SFU module could bring down the HTTP/API server handling stateless requests. Requires rigorous try-catch/fault-isolation in C++.

---

## 2. Backend Architecture (**Roaya** Core)

The backend is written in C++ (C++17/20) using the `roaya::` namespace for all core modules. It is decomposed into isolated, state-encapsulated modules.

### 1. HTTP & Auth Module
*   **Purpose:** Serve REST traffic and handle user authentication.
*   **Responsibilities:** JWT validation, REST routing, translating HTTP JSON requests to internal commands.
*   **Interfaces:** `HTTP Request -> JSON Response`; `validateToken()->UserSession`.
*   **Constraints:** Strictly stateless. Must interact with Database, not directly with Room Engine.

### 2. Signaling Module (WebSocket)
*   **Purpose:** Maintain persistent client connections.
*   **Responsibilities:** Hold active socket file descriptors, detect disconnects, parse incoming JSON signaling events, and push messages back to clients.
*   **Interfaces:** `onMessage(connId, payload)`, `send(connId, payload)`.
*   **Constraints:** Stateless execution. Merely a passthrough/translator to the Room Manager.

### 3. Room & Session Manager
*   **Purpose:** Act as the authoritative registry for active meetings.
*   **Responsibilities:** Track which participants are in which room, enforce capacity limits, and broadcast room-level events (e.g., "User A joined").
*   **Interfaces:** `joinRoom(participant, roomId)`, `leaveRoom(participant)`.
*   **Constraints:** Stateful but isolated. Must synchronize via Redis if scaling horizontally.

### 4. Media Transceiver Module (SFU)
*   **Topology (2026-04-10 decision):** the SFU is a **standalone Node.js worker** under `sfu/`, running mediasoup 3.x. It is *not* embedded in the C++ process. The C++ `SFUManager` is a thin proxy that forwards signaling requests (get capabilities, create transport, produce, consume) from the WebSocket client to the SFU's HTTP + Socket.IO API.
*   **Why standalone:** mediasoup ships a battle-tested Node supervision layer; the original plan to re-host it inside C++ would have duplicated that work for no latency win (media never touches the C++ process). Keeping the SFU in Node also lets us iterate on RTP/encoder tuning without rebuilding the C++ tree.
*   **Security:** the SFU **must** be reachable only with a backend-issued JWT. `sfu/src/main.ts` runs a dependency-free HS256 verifier keyed by `ROAYA_JWT_SECRET` and enforces it on both HTTP (`Authorization: Bearer …`) and Socket.IO (`handshake.auth.token` / `?token=` query / `Authorization` header). Issuer must be `roaya` and `exp` is checked.
*   **Responsibilities:** DTLS/SRTP handshakes, RTCP feedback (PLI/FIR), RTP forwarding to subscribers.
*   **Interfaces:** `sfu_get_router_rtp_capabilities`, `sfu_create_webrtc_transport`, `sfu_connect_webrtc_transport`, `sfu_produce`, `sfu_consume`, `sfu_get_active_producers`, `sfu_close_producer`.
*   **Constraints:** Stateful per router (one router per room), performance-sensitive, scales out by running multiple SFU workers behind a sticky load balancer.

### 5. Concurrency & Threading Strategy

The C++ backend utilizes a **Multi-Threaded Event-Loop Architecture** to handle high-concurrency video sessions without race conditions.

#### 1. IO Tier (Network Bound)
- **Pool**: 4-8 threads (scaled to CPU cores).
- **Responsibility**: Terminate TLS/SSL, parse HTTP/JSON, and manage the `libwebsockets` event loop.
- **Queueing**: Parsed commands are pushed to `Room-specific` lock-free queues.

#### 2. Room Tier (Compute Bound)
- **Pool**: Dedicated `WorkerPool`.
- **Strategy**: **One-Thread-Per-High-Load-Room** or **Thread-Sharding**.
- **Logic**: Each meeting has an assigned worker thread that processes all signaling, state updates, and SFU media routing for that meeting ONLY.
- **Benefit**: Zero lock contention (Mutex-Free) for core media processing within a meeting room.

#### 3. SFU Tier (Media Processing)
- **Strategy**: Offload SIMD-heavy operations (VP8/VP9/H.264 packet processing) to a specialized `MediaPool` if the room thread is saturated.
- **Encryption**: SRTP/DTLS handshakes are performed once per participant on the room thread.

**Decision**: Actor-Like Isolation.
— **Rationale**: Shared state between threads is the #1 cause of crashes in C++ video apps. By isolating each room to its own thread-context, we eliminate complex mutex locking and guarantee predictable real-time performance.
— **Tradeoff**: Vertical scaling is limited by the single-core performance of the meeting's assigned thread.

#### 4. Safety: Deadlock & Race Condition Mitigation

*   **Race Condition Mitigation**:
    *   **Shared-Nothing Actor Model**: Each `Room` instance is strictly owned by its assigned `WorkerThread`. All logic (adding producers, switching tracks) is executed within that thread's event loop.
    *   **Lock-Free Command Queues**: Inter-tier communication (e.g., IO thread to Room thread) is handled via **SPSC (Single-Producer Single-Consumer) lock-free queues**. This eliminates the need for global "ActiveRoom" mutexes that cause performance bottlenecks.
    *   **Atomic Hand-offs**: When a participant moves or a state is updated globally, we use **atomic pointer swaps** (std::atomic) or immutable state snapshots to ensure the reader always sees a valid version of the world.

*   **Deadlock Prevention**:
    *   **Elimination of Nested Locks**: Since a `Room` is single-threaded, it **never** requires a mutex to access its own `Participant` or `MediaTrack` maps. Removing locks from the internal room logic eliminates the possibility of circular wait conditions.
    *   **One-Way Resource Acquisition**: If a global lock is needed (e.g., for `RoomManager` statistics), a strict **Top-Down Hierarchy** is enforced (`Global -> Local`). Acquiring a local lock then trying to get a global one is prohibited by architecture.
    *   **Non-Blocking Event Loops**: The SFU logic never "waits" for IO or another thread. If data isn't ready, the loop moves to the next RTP packet or signaling event, ensuring the thread is never in a "Sleep-while-holding-lock" state.

#### 5. Concurrency Model Comparison & Final Decision

| Feature | Global Mutex (Traditional) | Pure Lock-Free (Atomics) | **Hybrid Actor-Model (Selected)** |
| :--- | :--- | :--- | :--- |
| **Simplicity** | High (std::lock_guard everywhere) | Very Low (Complexity of ABA, Memory Barriers) | Medium (Actor-Isolation logic) |
| **Performance** | Low (High contention, drops packets) | Maximum (Theoretical) | **High (Zero contention on Hot-Path)** |
| **Safety** | High (If careful with deadlocks) | Low (Extremely hard to debug) | **High (Local context is single-threaded)** |
| **Scalability** | Poor (Serialization bottleneck) | Excellent | **Excellent (Vertical scaling per core)** |

**Final Decision: Hybrid Actor-Model with Lock-Free Messaging**
— **Selection Rationale**: This is the industry-standard architecture for high-performance SFUs (e.g., Mediasoup). By isolating each `Room` to a single thread (the Actor), we gain the performance of a mutex-free environment for the 1000s of RTP packets-per-second, while using stable concurrency infrastructure (Mutex-based Task Queues) only for the low-frequency "Cold-Path" of thread dispatching. This provides the best balance of **Safety**, **Maintainability**, and **Performance**.

#### 6. Asynchronous Strategy: `WorkerThread` vs. `std::async`

While C++ provides `std::async` and `std::future`, our architecture explicitly favors a custom **`WorkerThread` (Pinned Event Loop)** model for the following reasons:

| Feature | `std::async` / `std::future` | **Custom `WorkerThread` (Event Loop)** |
| :--- | :--- | :--- |
| **Thread Pinning** | Poor (Often uses an opaque thread pool) | **Excellent (Room is pinned to a specific thread)** |
| **Cache Locality** | Low (Tasks might jump between cores) | **High (State remains in the same core's L1/L2 cache)** |
| **Flow Control** | Hard to manage (unbounded task creation) | **Easy (Backpressure via fixed-size SPSC queues)** |
| **Context Switching** | High (Frequent thread hand-offs) | **Minimal (Data is processed by the resident thread)** |

**Design Decision**: Avoid `std::async` for the Media Hot-Path.
— **Rationale**: For real-time SFUs, predictable latency is paramount. A pinned `WorkerThread` ensures that all RTP packets for a room are processed by the same core, maximizing CPU cache efficiency and eliminating the non-deterministic overhead of thread-pool dispatching and future synchronization.

### 6. Graceful Shutdown & Signal Handling

To ensure data integrity and clean resource termination (especially during CI/CD deployments), the backend implements a dedicated **Signal Management Wrapper**.

*   **Signals Handled**: `SIGINT`, `SIGTERM`, and `SIGHUP`.
*   **Abstraction**: A `SignalHandler` class wraps the low-level Unix signal API. It provides a thread-safe way for all modules (SFU, DB, RoomManager) to subscribe to a termination event.
*   **Execution Flow**:
    1.  Signal received by the wrapper.
    2.  `RoomManager` is notified to send `meeting_ended` / `server_stopping` signals to all active participants.
    3.  Media transports are closed, and background workers are joined.
    4.  Database connection pools are drained before the process exits.

---

## 3. Class Architecture

### Overview
The system follows a strict hierarchical ownership model to prevent memory leaks and dangling pointers.

#### Core Relationships
1. **Server** ── owning ──> **RoomManager**
2. **RoomManager** ── owning ──> **Rooms** (Map<ID, Room>)
3. **Room** ── owning ──> **Participants** (Map<ID, Participant>)
4. **Participant** ── owning ──> **Producers/Consumers** (Media Tracks)
5. **Room** ── owning ──> **SFURouter**

**Decision**: Smart Pointer Strictness.
— **Rationale**: Use `std::unique_ptr` for top-down ownership and `std::weak_ptr` for callbacks (circular avoidance).

---

## 4. Frontend Architecture (React/TS)

The frontend is layered to decouple UI components from brittle WebRTC lifecycle management.

### 1. Transport Layer (`SignalService` & `WebRTCClient`)
*   **Purpose:** Directly interface with network APIs.
*   **Responsibilities:** Establish WebSockets, configure `RTCPeerConnection`, attach local `MediaStream` tracks, and execute ICE exchanges.
*   **Constraints:** Agnostic to UI logic. Dispatches typed events upstream.

### 2. State Management Layer (Room Store)
*   **Purpose:** House the global truth of the active call.
*   **Responsibilities:** Maintain maps of Remote Participants, their current active Tracks, muting state, and connection status.
*   **Constraints:** Fully synchronous state. Must be the single source of truth dictating what the UI renders.

### 3. UI Component Layer
*   **Purpose:** Render the video grid and meeting controls.
*   **Responsibilities:** Subscribe to the State Management Layer. Attach HTML `<video srcObject={track}>` elements when new tracks arrive.

### Reconnection and Resilience Logic
**Decision:** Implement a Finite State Machine (FSM) for WebRTC connections instead of imperative `onICE/onTrack` boolean flags.
— **Rationale:** WebRTC negotiation is asynchronous and highly failure-prone. An FSM strictly orchestrates `IDLE -> SIGNALING -> CONNECTING -> CONNECTED -> RECONNECTING`.
— **Tradeoff:** Higher upfront boilerplate on the frontend compared to setting ad-hoc class properties.
*   **Bug Flag:** The existing `WebRTCClient.ts` handles generic peer-to-peer Maps. This likely causes race conditions where answers arrive for an outdated offer, or tracks are played before the UI knows the participant exists. Overriding state blindly leads to blank videos.

---

## 4. User Authentication & Authorization

The system implements a secure, JWT-based authentication mechanism.

### Flows
1.  **Registration**: User submits `email`, `password`, and `name`. Backend salts and hashes the password (using **Argon2** or **bcrypt**) before storing in PostgreSQL.
2.  **Login**: User submits credentials. Backend validates hash. On success, a **JWT (JSON Web Token)** is issued containing `userId` and `exp` (expiration).
3.  **Session Management**: Tokens are stateless. Clients include the `Authorization: Bearer <token>` header in HTTP requests and send the token in the initial WebSocket `join` message.

**Decision**: Use JWT for session management.
— **Rationale**: Enables horizontal scaling of the API tier without session affinity (sticky sessions) or central session storage lookups for every request.
— **Security Rule**: **Mandatory Authentication**. Anonymous/Guest users are strictly prohibited from creating or scheduling meetings. Every `POST /api/rooms` request must contain a valid JWT associated with a registered user.
— **Instance Rule**: **Single User Association**. Each running instance of the app (client or server worker) is bound to a single authenticated user session. Switching users requires a full logout/login cycle, invalidating previous session state.

---

## 5. Meeting Lifecycle & Host Controls

The host has exclusive control over the meeting's temporal state and ownership.

### Lifecycle States
*   **WAITING_FOR_HOST**: Default state upon room creation. Participants can join the "waiting room" but cannot exchange media.
*   **ACTIVE**: Host has joined and "started" the meeting. Media forwarding is enabled.
*   **ENDED**: Host has terminated the meeting. All connections are severed, and resources are purged.

### Host Operations
1.  **Start Meeting**: Transition from `WAITING_FOR_HOST` to `ACTIVE`.
2.  **End Meeting**: Global termination. The backend sends a `meeting_ended` signal via WebSocket, closes all `RTCPeerConnections` on the SFU, and flags the session as inactive in Redis.
3.  **Transfer Host**: The current host can promote any participant to the Host role.
4.  **Participant Management**:
    *   **Mute Others**: The host can send a `remote_mute` signal to any participant.
    *   **Kick Participant**: The host can forcibly remove a participant from the room. The backend severs the socket and invalidates the session ID to prevent immediate auto-rejoin.
    *   **Toggle Permissions**: The host can enable/disable "Allow Screen Sharing" for all non-host participants.
    *   **Remote Control**: The host (or any participant with host permission) can request control of another participant's shared screen.

### Host UI Context Menu
The frontend provides a participant list where the host sees a specialized menu. To ensure a premium, modern feel:
- **Icons-Only Controls**: 
  - `mute` -> 🔇 / 🎙️ (Toggle)
  - `kick` -> 🚪 / ⛔
  - `permissions` -> ⚙️ / 🛡️
  - `screen_share_toggle` -> 🖥️ (Enable/Disable)

**Decision**: Role-Based Access Control (RBAC) on Signaling.
— **Rationale**: Every sensitive action (Kick, Mute, Record) must be validated on the backend against the `hostId` stored in the Room state. Frontend-only hiding of buttons is insufficient for production security.

---

## 6. Meeting Recording Architecture

The system supports dual-mode recording for flexibility and reliability.

### 1. Local Recording (Client-Side)
*   **Mechanism**: Uses the Browser **MediaRecorder API**.
*   **Logic**: The frontend captures the combined local + remote streams directly from the DOM elements.
*   **Pros/Cons**: Zero server cost, high privacy. However, if the user closes the tab, the recording is lost.

### 2. Cloud Recording (Server-Side)
*   **Mechanism**: The SFU spins up a virtual participant (Recorder Instance).
*   **Process**:
    1.  **Compositing**: A headless instance (e.g., Puppeteer or a custom FFmpeg/GStreamer sink) joins the room.
    2.  **Encoding**: Streams are mixed into a single MP4/WebM file.
    3.  **Storage**: Once the meeting ends, the file is uploaded to a pre-defined cloud provider (**Google Drive**, **AWS S3**, etc.) via an asynchronous Background Worker.
*   **Pros/Cons**: Highly reliable, available to all participants via a link. Requires significant server CPU/Storage.

**Decision**: Asynchronous Cloud Uploading.
— **Rationale**: Uploading large video files to Google Drive is slow. The Recording Engine should save to local SSD first, then offload the upload to a "Worker Process" to avoid blocking SFU performance.

---

## 7. Recording Configuration & Media Optimization

To ensure efficient storage and high compatibility, the following standards are adopted.

### 1. Media Compression Techniques
*   **Video Codec**: **H.264 (MPEG-4 AVC)**.
    *   **Rationale**: Universal hardware acceleration across all devices. Provides the best balance between quality and CPU usage for real-time compositing.
    *   **Settings**: CRF (Constant Rate Factor) 23, Profile: High, Level: 4.1.
*   **Audio Codec**: **AAC-LC**.
    *   **Rationale**: High fidelity at low bitrates (128kbps stereo) and native support in all browsers/players.
*   **Container**: **MP4 (Fast Start)**.
    *   **Rationale**: Moving metadata to the front of the file allows the recording to be playable even if it is still being uploaded or partially downloaded.

### 2. Google Drive Integration (Dynamic Configuration)
To allow flexibility without server restarts, storage settings are managed through a **Settings GUI**.

*   **GUI Interface**: Users can configure `Client ID`, `Client Secret`, and `Folder ID` via the frontend dashboard.
*   **Dynamic OAuth2 Flow**: The UI provides an "Authorize" button that opens the Google consent screen. Upon approval, the `Refresh Token` is captured and sent to the backend.
*   **Secure Persistence**: Credentials are encrypted and stored in **PostgreSQL**.
*   **Runtime Fetching**: The Recording Engine fetches the latest validated credentials from the DB before starting any cloud upload.

**Data Schema (Settings)**: 
```json
{
  "active_provider": "google_drive",
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "...",
  "folder_id": "..."
}
```

**Decision**: OAuth2 Refresh Token Flow.
— **Rationale**: Meeting recordings happen in the background without user presence. A persistent refresh token allows the server to request a new access token for each upload session autonomously.

---

## 8. Meeting Scheduling & Google Calendar Integration

The scheduling feature allows users to plan future meetings and synchronize them with external calendars.

### 1. Internal Scheduling Logic
*   **Persistence**: Scheduled meetings are stored in **PostgreSQL** with `startTime`, `endTime`, and a `status` of `SCHEDULED`.
*   **Reminders**: A background worker (e.g., using **Redis dynamic expiration** or a cron-based task) monitors upcoming meetings and sends notifications (WebSocket or Email) 5-10 minutes before start.

### 2. Google Calendar Integration
*   **OAuth2 Scopes**: Requires `https://www.googleapis.com/auth/calendar.events` to create and manage meeting events.
*   **Flow**:
    1.  User schedules a meeting in the app.
    2.  App requests/refreshes the Google OAuth2 token.
    3.  App calls Google Calendar API to create an event.
    4.  The `htmlLink` from Google is stored in our DB, and the `meetingCode` is added to the Google Event's description/location.
*   **Webhook Sync**: Optional bidirectional sync using Google Calendar **Watch** (Webhooks) to detect if a meeting was moved or deleted in the Google UI.

**Decision**: Link-First Scheduling.
— **Rationale**: When a meeting is scheduled, the `meetingCode` is generated immediately. This allows the calendar invite to contain a valid join link (`/join/{code}`) even before the meeting process starts.

---

## 10. Screen Sharing Implementation

Screen sharing is treated as a high-bandwidth, secondary video track produced by a participant.

### 1. Client-Side Capture
*   **API**: Uses `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`.
*   **Logic**: The frontend creates a **new RTCPeerConnection** or a **new Producer** on the existing transport specifically for the screen stream.
*   **Constraints**: Screen sharing typically requires higher bitrates and lower frame rates (5-15 FPS) compared to camera video (30 FPS) to maintain text clarity.

### 2. SFU Handling
*   **Secondary Producer**: The SFU treats the screen share as an independent `Producer`.
*   **Broadcasting**: When a `screen_share_start` signal is received, the SFU notifies all other participants to `consume` this specific `producerId`.
*   **Layout Priority**: The frontend state management must flag this participant as "Sharing Screen," triggering a UI transition to a "Stage Layout" (Large screen share + small video strip).

**Decision**: Simultaneous Camera + Screen.
— **Rationale**: Users expect to be seen (camera) while presenting (screen). The architecture supports multiple active producers per participant.
— **Tradeoff**: Increased CPU and bandwidth usage for the sender and SFU.

---

## 11. Remote Control Implementation

Remote control allows a participant (usually the host) to interact with a shared screen.

### 1. Mechanism
*   **Signaling**: The controller sends a `remote_control_request`. The presenter must explicitly accept via a UI prompt.
*   **Data Channel**: Uses a **WebRTC DataChannel** for low-latency input event transmission (Mouse move, Click, Keypress).
*   **Execution**: The presenter's client receives the input events and uses a local system-level API (or a browser-safe simulation if confined to the app) to execute the actions.

---

## 12. Deployment & CI/CD

The application is designed for containerized deployment to ensure consistency across environments.

### 1. Containerization (Docker)
*   **Backend**: A multi-stage Docker build is used to compile the C++ source and produce a minimal runtime image.
*   **Frontend**: The React application is built and served via a production-tuned NGINX container.
*   **Orchestration**: `docker-compose` is used for local development and staging, defining the interactions between the API, SFU, Redis, and PostgreSQL.

### 2. CI/CD Pipeline (Jenkins)
*   **Automation**: A Jenkins pipeline (defined in a `Jenkinsfile`) automates the build, test, and deployment process.
*   **Validation**: Every commit triggers automated unit tests (C++ GoogleTest and Frontend Vitest) and linting checks.
*   **Delivery**: Successful builds result in Docker images pushed to a secure registry, followed by automated deployment to the staging environment.

---

## 13. Room Access & Joining Logic

Participants can access meetings through three primary mechanisms:

### 1. Meeting ID / Code
*   **Structure**: 9-11 digit human-readable alphanumeric code (e.g., `xyz-wpqr-abc`).
*   **Resolution**: The Backend maintains a mapping `MeetingCode -> InternalRoomId` in Redis for O(1) resolution.

### 2. Invite Links
*   **Structure**: `https://zoom.app/join/{meetingCode}`.
*   **Logic**: The frontend extracts the code from the URL and automatically prompts the `join_room` flow.

### 3. Direct Join (Authenticated)
*   Authenticated users can see "Active Meetings" they have been invited to or have created.

**Decision**: Use Meeting Codes as public aliases for Internal UUIDs.
— **Rationale**: UUIDs are secure but hard to type or share verbally. Codes provide a user-friendly abstraction while internal systems use immutable UUIDs.

---

## 6. WebRTC Signal Flow

1.  **Room Creation and Joining:**
    *   Client posts `/api/rooms` to generate a `roomId`.
    *   Client opens WebSocket, sends `{"type": "join_room", "roomId": "..."}`.
    *   Backend RoomManager verifies room, assigns a worker thread, and broadcasts `participant_joined` to others.
2.  **ICE Negotiation & Media Capability Exchange:**
    *   Client queries local devices and creates `RTCPeerConnection`.
    *   Client sends `{"type": "webrtc_offer", "sdp": "..."}` to Backend.
    *   SFU parses SDP, creates receiving endpoint, and replies `{"type": "webrtc_answer", "sdp": "..."}`.
    *   Parallelly, Client and SFU exchange `{"type": "ice_candidate"}` independently.
3.  **Track Add/Remove (Camera/Mic/Screen):**
    *   Client calls `addTrack()`. Local RTCPeerConnection triggers `negotiationneeded`.
    *   Client and SFU do a new Offer/Answer exchange.
    *   SFU notices the new media stream. It signals **all other participants in the room** with a new `webrtc_offer` dictating that a new track is available.
    *   Other clients respond with `webrtc_answer` to subscribe.
4.  **Participant Disconnect:**
    *   *Graceful:* Client sends `{"type": "leave_room"}`. Backend kills the Participant objects, halts media forwarding, broadcasts `participant_left`.
    *   *Ungraceful:* WebSocket drops or Heartbeat (Ping/Pong) times out. Backend triggers the exact same teardown logic internally to prevent zombie streams.

---

## 5. Data Models

### Domain Entities
*   **User**: `id` (UUID), `email`, `name`, `passwordHash`, `createdAt`.
*   **Room**: `id` (UUID), `meetingCode` (String), `name`, `hostId`, `status` (`WAITING`, `ACTIVE`, `ENDED`), `isPrivate`.
*   **Participant**: `id`, `userId` (Optional for guests), `roomId`, `joinTime`.
*   **Track**: `id`, `kind`, `source`, `ssrc`, `status`.
*   **Session**: Historic record of a completed room.

### Signaling Event Schema (JSON)
*   **Client -> Server:** `join`, `leave`, `produce`, `consume`, `webrtc_offer`, `webrtc_answer`, `ice_candidate`.
*   **Server -> Client:** `room_state`, `new_participant`, `participant_left`, `new_track`, `webrtc_offer`, `webrtc_answer`, `ice_candidate`.

---

## 6. API Surface

### REST API (Stateless)
*   `POST /api/auth/register` -> Create user profile.
*   `POST /api/auth/login` -> Returns `{ token, user }`.
*   `GET /api/auth/profile` -> Returns current user data using JWT.
*   `POST /api/rooms` -> [Auth Required] Create a new meeting (Immediate or Scheduled).
*   `GET /api/rooms/scheduled` -> [Auth Required] List upcoming meetings for the user.
*   `POST /api/rooms/:id/end` -> End the meeting (Host only).
*   `POST /api/rooms/:id/transfer-host` -> Transfer host role.
*   `POST /api/rooms/:id/kick/:participantId` -> Forcibly remove participant (Host only).
*   `POST /api/rooms/:id/mute/:participantId` -> Remote mute participant (Host only).
*   `POST /api/rooms/:id/permissions` -> Update room permissions (e.g., allowScreenShare: bool).
*   `POST /api/calendar/sync` -> Force sync with Google Calendar.
*   `POST /api/rooms/:id/record/start` -> Start cloud recording (Host only).
*   `POST /api/rooms/:id/record/stop` -> Stop cloud recording (Host only).
*   `POST /api/rooms/:id/screen-share/start` -> Notify signaling of intent to share screen.
*   `GET /api/settings/storage` -> [Auth Required] Retrieve current storage settings.
*   `POST /api/settings/storage` -> [Auth Required] Update storage settings and initiate OAuth2.
*   `GET /api/rooms/code/:code` -> Resolve a meeting code to room metadata.

### WebSocket API (Stateful Signaling)
*   `join_room`: Payload includes `meetingCode` and optional `token`.
*   `host_changed`: Server-to-Client broadcast when meeting ownership changes.
*   `meeting_ended`: Server-to-Client broadcast when house is closed.

### C++ Inter-Module Interfaces
*   `RoomManager::handleParticipantJoin(std::unique_ptr<Participant> p)`
*   `SFUCore::addProducer(ParticipantId pId, TrackConfig config)` -> Returns `Promise<ProducerId>`
*   `WebSocketServer::broadcast(RoomId rId, const std::string& jsonString)`

---

## 7. Bug-Prone Areas & Mitigation

1.  **State Desync during Network Flaps (Frontend):** 
    *   *Bug:* UI shows participant is in the room, but their video object is garbage collected.
    *   *Mitigation:* Use strict Redux/Zustand pattern. React components must be pure functions of the State Store.
2.  **WebRTC Renegotiation Glitches (Frontend):**
    *   *Bug:* Calling `createOffer` while another negotiation is pending crashes the connection.
    *   *Mitigation:* Implement an **Operations Queue**. All signaling commands must be serialized; if `signalingState !== 'stable'`, queue the next offer.
3.  **Circular References (C++ Backend):**
    *   *Bug:* Participants referencing Rooms, Rooms referencing WebSockets, preventing memory clearance.
    *   *Mitigation:* Strict **Ownership Tree**. Use `std::weak_ptr` when a child needs to send a message up to the parent `Room`.
4.  **Event Loop Blocking (C++ Backend):**
    *   *Bug:* Heavy JSON parsing or blocking DB calls stall the WebSocket thread, causing UDP media packets to drop.
    *   *Mitigation:* **Offload computing**. JSON parsing happens on a generic IO thread pool; parsed structs are passed to the Room-pinned worker thread via lock-free queues.
5.  **Phantom Audio/Video Tracks (Backend/Frontend):**
    *   *Bug:* When a producer abruptly disconnects, consumers still expect packets, resulting in UI lockups or frozen frames.
    *   *Mitigation:* Complete **Lifecycle Bindings**. SFU must proactively intercept socket disconnects, emit an internal `track_ended` event to all Consumers, and force the frontend to discard the `MediaStreamTrack`.

---

## 8. Technology Recommendations

### SFU Infrastructure
**Decision:** Integrate **libmediasoup-worker** (C++) directly, or alternatively, **Pion** (Go - though breaks constraint). Given constraints: Use a wrapper around an existing C++ WebRTC library like **libwebrtc** ([docs](https://webrtc.github.io/webrtc-org/native-code/native-apis/)) or **mediasoup's C++ core** ([docs](https://mediasoup.org/documentation/v3/mediasoup/api/)).
— **Rationale:** Writing a production SFU from scratch requires man-years of handling jitter buffers, NACKs, and bandwidth estimators (GCC). Integrating an existing C++ WebRTC library provides stability and scales horizontally.
— **Tradeoff:** Steep learning curve integrating massive C++ WebRTC dependencies into the build system.

### STUN/TURN
**Decision:** **Coturn** ([repo/docs](https://github.com/coturn/coturn)).
— **Rationale:** Highly optimized, production-proven, open-source relay server that handles both STUN and TURN natively.
— **Tradeoff:** Requires separate server provisioning and maintaining TURN credentials, adding DevOps overhead.

### Frontend State Management & Signaling
**Decision:** **Zustand** ([docs](https://zustand-demo.pmnd.rs/)) + **XState** ([docs](https://stately.ai/docs/xstate)).
— **Rationale:** Zustand is unopinionated and incredibly fast for storing active `MediaStream` object references (which break Redux's serializability rules). XState manages the strict state transitions of the WebRTC connection lifecycle.
— **Tradeoff:** Developers must learn XState formalism instead of using familiar boolean flags (`isConnecting`, `hasVideo`).

### Database
**Decision:** **Redis** ([docs](https://redis.io/docs/)) for state caching; **PostgreSQL** ([docs](https://www.postgresql.org/docs/)) for persistence.
— **Rationale:** Redis Pub/Sub natively solves the problem of horizontally scaling the C++ nodes (SFU Node A needs to know a user on Node B joined the room).
— **Tradeoff:** Introduces split-brain risks requiring careful consistency management between process memory and Redis.

### Standard Web APIs Used
- **WebRTC API**: `RTCPeerConnection`, `RTCSessionDescription`, `RTCIceCandidate` ([MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API))
- **Media Streams API**: `getUserMedia`, `getDisplayMedia`, `MediaStreamTrack` ([MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API))
- **WebSocket API**: Native browser `WebSocket` implementation ([MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket_API))

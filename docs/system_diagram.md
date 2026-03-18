# System Architecture Diagrams

This document visually represents the high-level architecture mapped out for the **Roaya** application.

## High-Level System Architecture

```mermaid
graph TD
node1["Frontend Client (React/TS)"]
node3["Cloud Load Balancer / NGINX"]
node4["HTTP & Auth Module"]
node5["Signaling Module WebSocket"]
node6["Room & Session Manager"]
node7["Media Transceiver Module / SFU"]
node8["Redis (ephemeral state)"]
node9["PostgreSQL (persistent DB)"]
node10["Coturn STUN/TURN Server"]
node11["Recording Engine"]
node12["Scheduling Service"]
node13["Google APIs (Drive/Calendar)"]

node1 --> node3
node1 -.-> node10
node3 --> node4
node3 --> node5
node3 --> node12
node4 --> node9
node5 --> node6
node6 --> node8
node6 --> node7
node6 --> node11
node12 --> node9
node12 --> node13
node11 --> node7
node11 --> node13
node1 --- node7
```

## Internal C++ Module Layout 

```mermaid
graph LR
subgraph s1["C++ Backend Server Process"]
subgraph s2["IO Threads"]
n1["HTTP Router"]
n2["WebSocket Router"]
end
subgraph s3["Worker Threads"]
n3["Room Worker Loop"]
n4["SFU Forwarding Engine"]
n5["DTLS/SRTP Handler"]
end
n6["Database Connection Pool"]
n1 -.-> n6
n2 --> n3
n3 --> n4
n4 --> n5
end
```

## Backend Class Diagram

```mermaid
classDiagram
    class Server {
        -RoomManager roomManager
        -WebSocketServer wsServer
        -HTTPServer httpServer
        +start()
        +stop()
    }
    class RoomManager {
        -map[ID, Room] rooms
        +createRoom()
        +getRoom()
        +removeRoom()
    }
    class Room {
        -string id
        -string meetingCode
        -string hostId
        -map[ID, Participant] participants
        -SFURouter sfuRouter
        +addParticipant()
        +broadcast()
        +setPermissions()
    }
    class Participant {
        -string id
        -string name
        -Role role
        -map[ID, Producer] producers
        -map[ID, Consumer] consumers
        +mute()
        +kick()
    }
    class SFURouter {
        -map[ID, Transport] transports
        +createTransport()
        +pipeStream()
    }
    class Producer {
        -string id
        -TrackKind kind
        +pause()
        +resume()
    }
    class Consumer {
        -string id
        -string producerId
        +pause()
        +resume()
    }
    
    subgraph Concurrency_Infrastructure
        class WorkerThread {
            -std::thread thread
            -SPSCQueue[Task] incomingTasks
            +runLoop()
            +postTask(Task)
        }
        class SPSCQueue~T~ {
            -std::atomic[Node*] head
            -std::atomic[Node*] tail
            +push(T)
            +pop()
        }
        class TaskQueue {
            -std::mutex mutex
            -std::condition_variable cv
            -std::deque[Task] queue
            +push(Task)
            +pop()
        }
    end

    Server *-- RoomManager
    RoomManager "1" *-- "many" Room
    Room "1" *-- "many" Participant
    Room *-- SFURouter
    Participant "1" *-- "many" Producer
    Participant "1" *-- "many" Consumer
    SFURouter ..> Producer : routes
    SFURouter ..> Consumer : creates
    
    Server *-- TaskQueue : dispatching tasks
    WorkerThread o-- SPSCQueue : room-specific signaling
    WorkerThread ..> TaskQueue : wait for work
```

## SFU WebRTC Flow

```mermaid
sequenceDiagram
participant c1 as "Client 1 (Sender)"
participant sig as "Signaling Server"
participant sfu as "SFU (Media Server)"
participant c2 as "Client 2 (Receiver)"
Note over c1,c2: "Client 2 is already in the room"
c1->>sig: "join_room (websocket)"
sig->>c1: "room_state"
Note over c1: "Client 1 starts camera"
c1->>sig: "webrtc_offer (produce video)"
sig->>sfu: "addProducer()"
sfu-->>sig: "webrtc_answer"
sig->>c1: "webrtc_answer (accept video)"
c1->>sfu: "Stream RTP video (UDP)"
Note over c2: "Notify existing participants"
sig->>c2: "webrtc_offer (new video track available)"
c2->>sig: "webrtc_answer (consume video)"
sig->>sfu: "addConsumer(Client2)"
sfu->>c2: "Stream duplicated RTP video (UDP)"
```

## User Registration & Login Flow

```mermaid
sequenceDiagram
participant U as "User"
participant F as "Frontend"
participant B as "Backend"
participant DB as "PostgreSQL"

U->>F: "Enter Email/Pass/Name"
F->>B: "POST /api/auth/register"
B->>B: "Hash Password (Argon2)"
B->>DB: "Store User Record"
B-->>F: "201 Created"

U->>F: "Login Request"
F->>B: "POST /api/auth/login"
B->>DB: "Fetch User & Hash"
B->>B: "Verify Hash"
B->>B: "Generate JWT (Sign with Secret)"
B-->>F: "200 OK { token, user }"
F->>F: "Store Token in LocalStorage"
```

## Joining via Meeting Code / Link

```mermaid
sequenceDiagram
participant U as "User"
participant F as "Frontend"
participant B as "Backend"
participant WS as "WebSocket Server"

U->>F: "Enter Code OR Click Link"
F->>B: "GET /api/rooms/code/:code"
B-->>F: "200 OK { roomId, isPrivate }"
F->>WS: "Connect WebSocket"
WS->>WS: "Validate JWT (if provided)"
F->>WS: "join_room { meetingCode, token }"
WS->>B: "Resolve Code -> RoomId"
B-->>WS: "Room Context"
WS-->>F: "joined_successfully { participants }"
```

## Host Control Transfer Flow

```mermaid
sequenceDiagram
participant H as "Host (User A)"
participant F as "Frontend"
participant B as "Backend"
participant P as "Participant (User B)"

H->>F: "Click 'Make Host' on User B"
F->>B: "POST /api/rooms/:id/transfer-host { newHostId: UserB }"
B->>B: "Verify User A is current Host"
B->>B: "Update Room.hostId = UserB"
B-->>F: "200 OK"
B-->>P: "Notification: You are now the Host"
B-->>F: "Broadcast: Host is now User B"
```

## Cloud Recording Flow

```mermaid
sequenceDiagram
participant H as "Host"
participant F as "Frontend"
participant B as "Backend/SFU"
participant RE as "Recording Engine"
participant GD as "Google Drive"

H->>F: "Click 'Start Cloud Record'"
F->>B: "POST /api/rooms/:id/record/start"
B->>RE: "Spawn Recorder Instance"
RE->>B: "Joint Room as Virtual Peer"
Note over RE,B: "Captures & Encodes RTP Streams"

H->>F: "Click 'Stop Cloud Record'"
F->>B: "POST /api/rooms/:id/record/stop"
B->>RE: "Finalize MP4 File"
RE->>GD: "Async Upload to Drive"
GD-->>B: "Storage Link"
B-->>H: "Notification: Recording Uploaded"
```

## Dynamic Storage Configuration Flow

```mermaid
sequenceDiagram
participant A as "Admin/Host"
participant F as "Frontend GUI"
participant B as "Backend API"
participant G as "Google Auth"
participant DB as "PostgreSQL"

A->>F: "Open Storage Settings"
F->>B: "GET /api/settings/storage"
B-->>F: "Current Config (Masked)"
A->>F: "Enter ClientID/Secret/FolderID"
F->>G: "Redirect to Google Consent"
G-->>F: "Auth Code"
F->>B: "POST /api/settings/storage { code, config }"
B->>G: "Exchange Code for Refresh Token"
B->>B: "Encrypt Tokens"
B->>DB: "Persist Settings"
B-->>F: "Success: Storage Configured"
```

## Meeting Scheduling & Google Calendar Flow

```mermaid
sequenceDiagram
participant U as "User"
participant F as "Frontend"
participant B as "Backend"
participant DB as "PostgreSQL"
participant G as "Google Calendar API"

U->>F: "Schedule Meeting (Time/Date)"
F->>B: "POST /api/rooms (scheduled)"
B->>B: "Generate Meeting Code"
B->>DB: "Store Meeting (SCHEDULED)"
B->>G: "Create Calendar Event"
G-->>B: "Success { htmlLink }"
B->>DB: "Update Meeting with htmlLink"
B-->>F: "Success { meetingCode, googleLink }"
```

## Screen Sharing Flow

```mermaid
sequenceDiagram
participant U as "Presenter"
participant F as "Frontend"
participant B as "Backend/SFU"
participant P as "Viewers"

U->>F: "Click 'Share Screen'"
F->>F: "Capture DisplayStream"
F->>B: "webrtc_offer (screen video track)"
B->>B: "Create Screen Producer"
B-->>F: "webrtc_answer"
F->>B: "Stream Screen RTP (UDP)"
B->>P: "new_track signal (screen)"
P->>B: "webrtc_offer (consume screen)"
B-->>P: "webrtc_answer"
B->>P: "Broadcast Screen RTP (UDP)"
```

## Host Management: Kick & Mute

```mermaid
sequenceDiagram
participant H as "Host"
participant F as "Host Frontend"
participant B as "Backend"
participant P as "Participant"
participant PF as "Participant Frontend"

Note over H,F: "Host sees Icon Menu (Mute/Kick)"
H->>F: "Click ⛔ (Kick)"
F->>B: "POST /api/rooms/:id/kick/:participantId"
B->>B: "Verify Host Permissions"
B->>P: "Close WebSocket & Media"
B-->>PF: "Signal: You have been removed"
B-->>F: "Broadcast: Participant Left"

H->>F: "Click 🔇 (Remote Mute)"
F->>B: "POST /api/rooms/:id/mute/:participantId"
B-->>PF: "Signal: remote_mute_audio"
PF->>PF: "Mute local AudioTrack"
```

## Remote Control Flow

```mermaid
sequenceDiagram
participant C as "Controller (Host)"
participant F as "Controller Frontend"
participant B as "Signaling Server"
participant P as "Presenter (Shared Screen)"
participant PF as "Presenter Frontend"

C->>F: "Click 'Request Remote Control'"
F->>B: "remote_control_request"
B-->>PF: "Prompt: Allow Host to control screen?"
PF->>P: "Presenter clicks 'Allow'"
P->>PF: "Accept Request"
PF->>B: "remote_control_granted"
B-->>F: "Establish WebRTC DataChannel"
F->>B: "Send InputEvents (Mouse/Keyboard)"
B-->>PF: "Execute InputEvents via local agent"
```

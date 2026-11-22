# Chatty

Chatty is a real-time, browser-based chat app. The frontend is plain HTML, CSS, and JavaScript. The backend is a Java 21 Spring Boot service using WebSockets, SockJS, and STOMP.

## Live deployment

- **Frontend:** [Chatty on Render](https://real-time-chat-application-frontend-zxli.onrender.com/chat.html)
- **Backend:** [Backend service on Render](https://real-time-chat-application-3njs.onrender.com)

The frontend connects to the backend URL configured in `frontend/chat.js`. If either service URL changes, update that URL, the Content Security Policy in `frontend/chat.html`, and the backend's allowed browser origins.

## Features

- Three channels: `#general`, `#random`, and `#introductions`.
- Choose a display name for each browser window.
- Live text chat with a reconnecting WebSocket client.
- Per-channel messages stay in the browser session, including messages received while viewing another channel. Refreshing the page clears that session's messages.
- Share JPEG, PNG, and GIF images, or record and preview voice messages before sending. Pending recordings can be deleted.
- Edit and delete your sent messages. Edits are marked, and deletions appear as an italic notice to other participants.
- View read receipts for messages while participants are connected.
- See who is typing in the current channel; typing status clears when they pause, switch channels, or disconnect.
- Reply to another participant's message with an in-context quote that links back to the original message.
- Light and dark themes, emoji picker, responsive mobile layout, and per-channel empty state.
- Server-side validation and rate limiting, attachment size and image dimension limits, exact-origin CORS, browser and server security headers, and a non-root backend container.

## Run locally

Requirements: Java 21, Python 3, and Maven (or use the Maven wrapper).

1. Start the backend:

   ```sh
   cd backend
   ./mvnw spring-boot:run
   ```

   The backend listens on `http://localhost:8080`.

2. In another terminal, serve the frontend:

   ```sh
   cd frontend
   python3 -m http.server 5500
   ```

3. Open [http://localhost:5500/chat.html](http://localhost:5500/chat.html).

The frontend automatically uses port 8080 when opened from `localhost` or `127.0.0.1`. For a different backend, set the `chat-backend-url` meta tag in `frontend/chat.html` to its base URL.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `CHAT_ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed for HTTP CORS and WebSocket connections. Use origins only, without a path. | Local development origins and the deployed Render frontend origin |
| `CHAT_UPLOAD_DIR` | Directory where uploaded images and audio are stored. | `uploads` under the backend working directory |
| `CHAT_UPLOAD_MAX_TOTAL_BYTES` | Maximum total size of stored uploads. | `1073741824` (1 GiB) |

Uploads are limited to 10 MB per image (20 megapixels) and 15 MB per audio message. Local uploads are stored in `backend/uploads` when running from the repository's `backend` directory. The application does not persist chat messages across browser refreshes or backend restarts.

## Deploy on Render

The existing deployment uses separate frontend and backend services. Check and manage them in the [Render Dashboard](https://dashboard.render.com).

- **Frontend:** create or update a Static Site connected to this repository, with `frontend` as the publish directory. There is no frontend build step.
- **Backend:** create or update a Docker Web Service with `backend` as its build context and `backend/Dockerfile` as its Dockerfile.
- Set `CHAT_ALLOWED_ORIGINS` on the backend to the exact frontend origin, such as `https://real-time-chat-application-frontend-zxli.onrender.com`. Add local origins only when needed for development.
- If the frontend or backend hostname changes, update the frontend backend URL in `frontend/chat.js` and the corresponding allowed hosts in its Content Security Policy.
- Configure persistent storage for backend uploads if images and voice messages must survive backend redeploys. Set `CHAT_UPLOAD_DIR` to a directory on that persistent volume.

After pushing changes to the connected Git repository, trigger a deploy for the frontend and backend services as needed. Frontend changes require a frontend deploy; Java/backend changes require a backend deploy.

## Project layout

```text
frontend/
  chat.html                 Chat UI and Content Security Policy
  chat.css                  Themes, layout, and responsive styles
  chat.js                   WebSocket client and chat interactions
  images/                   Legacy image assets
backend/
  Dockerfile                Multi-stage Java 21 container build
  pom.xml                   Maven dependencies and build configuration
  src/main/java/            Spring Boot controllers, models, services, and config
  src/main/resources/       Application configuration
  uploads/                  Local attachment storage (created at runtime)
```

## Limitations

Chatty is an anonymous public chat. Display names are self-selected, and messages and attachments are visible to anyone connected to a channel. Do not use it for private conversations or sensitive files. The server keeps limited in-memory message records for edit, delete, and read-receipt handling, but does not provide message history or replay to new connections. The browser separately keeps channel messages for that page session. Production use with a larger audience needs persistent message storage, identity and access control, moderation, abuse monitoring, and operational health checks.

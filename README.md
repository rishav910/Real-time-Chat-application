# Real-Time Chat Application
Real-time chat application built with Java Spring Boot, Spring WebSockets for the backend. With the use of WebSockets/SockJS, instant message delivery is ensured over STOMP and TCP.

Deployed over - https://real-time-chat-application-frontend-zxli.onrender.com/chat.html

# Features

- Real-time Messaging: Send and receive messages instantly without page reloads.
- WebSocket Communication: Utilizes Spring Boot's WebSocket capabilities.
- SockJS Fallback: Ensures compatibility across various browsers and network environments.
- User-friendly Interface: Simple and clean chat interface with responsive design.
- Separated Frontend & Backend: Clear architectural separation for independent development and deployment.

# Technologies Used in Backend:

- Spring Boot: Framework for building robust, production-ready Spring applications.
- Spring WebSocket: Provides WebSocket and SockJS support.
- Maven: Build automation tool.
- Java 21: Programming language version.
- Docker: For containerizing the backend application for consistent deployment.

# Technologies Used in Frontend:

- HTML5: Structure of the web page.
- CSS3: Styling and layout (custom styles and Bootstrap 5).
- JavaScript: Client-side logic for connecting to WebSockets and handling UI interactions.
- SockJS Client: JavaScript library for WebSocket emulation.
- STOMP.js: JavaScript library for STOMP messaging over WebSockets.

# Usage

1. Open the deployed frontend URL in your browser (e.g., https://your-frontend-name.onrender.com/).
2. Enter your name in the "Your name..." field.
3. Type a message in the "Type a message..." field and press Enter or click "Send".
4. Messages will appear in real-time in the chat window.

# Future Enhancements

- Chat application Home page.
- User Authentication: Implement user login/registration.
- Multiple Chat Rooms: Allow users to join different chat rooms.
- Message History: Store and retrieve past messages.
- Typing Indicators: Show when other users are typing.
- User List: Display a list of active users.
- Improved UI/UX: More advanced styling and animations.
- Database Integration: Persist chat messages using a database using JDBC (Java Database Connectivity), JPA (Java Persistence API).

# Project Structure
The project is structured into two main directories:

```
chatapp/
├── frontend/             # Contains all static frontend assets
│   ├── index.html        # Main chat application HTML
│   ├── chat.css          # Custom CSS for styling
│   └── images/           # Background images used in the frontend
│       ├── background3.png
│       └── chat-background4.jpg
└── backend/              # Contains the Spring Boot backend application
    ├── src/
    │   ├── main/
    │   │   ├── java/         # Java source code (e.g., controllers, configs)
    │   │   │   └── com/chat/app/
    │   │   │       ├── config/
    │   │   │       │   ├── CORSConfig.java     # CORS configuration
    │   │   │       │   └── WebSocketConfig.java # WebSocket configuration
    │   │   │       └── controller/
    │   │   │           └── ChatController.java # Handles chat messages
    │   │   └── resources/    # Spring Boot resources
    │   │       └── application.properties # Application properties
    │   └── test/
    ├── pom.xml               # Maven project file
    ├── mvnw                  # Maven Wrapper script (executable)
    ├── mvnw.cmd              # Maven Wrapper script for Windows
    └── Dockerfile            # Docker configuration for the backend
```


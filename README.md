# Real-Time Chat Application
This is a real-time chat application built with Spring Boot for the backend and plain HTML, CSS, and JavaScript for the frontend. It leverages WebSockets (with SockJS as a fallback) for instant message delivery. The application is designed for easy local development and deployment to cloud platforms.

# Features
Real-time Messaging: Send and receive messages instantly without page reloads.

WebSocket Communication: Utilizes Spring Boot's WebSocket capabilities.

SockJS Fallback: Ensures compatibility across various browsers and network environments.

User-friendly Interface: Simple and clean chat interface with responsive design.

Separated Frontend & Backend: Clear architectural separation for independent development and deployment.

# Technologies Used in Backend:
Spring Boot: Framework for building robust, production-ready Spring applications.

Spring WebSocket: Provides WebSocket and SockJS support.

Maven: Build automation tool.

Java 21: Programming language version.

Docker: For containerizing the backend application for consistent deployment.

# Technologies Used in Frontend:
HTML5: Structure of the web page.

CSS3: Styling and layout (custom styles and Bootstrap 5).

JavaScript: Client-side logic for connecting to WebSockets and handling UI interactions.

SockJS Client: JavaScript library for WebSocket emulation.

STOMP.js: JavaScript library for STOMP messaging over WebSockets.

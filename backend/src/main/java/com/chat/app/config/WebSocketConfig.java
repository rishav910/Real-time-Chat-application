package com.chat.app.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Value("${server.port}")
    private int port;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Set end points for our Web socket connection
        // SockJS is used by clients who don't support Web Socket
        String origin = "http://localhost:" + String.valueOf(port);
        registry.addEndpoint("/chat")
                .setAllowedOrigins(origin)
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Set message broker
        // /topic/chatRoom1 -> Everyone subscribed to this, will get the message
        registry.enableSimpleBroker("/topic");
        // Expect message with /app/sendmessage
        registry.setApplicationDestinationPrefixes("/app");
    }
}

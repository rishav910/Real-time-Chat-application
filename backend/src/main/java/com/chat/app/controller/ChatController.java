package com.chat.app.controller;

import com.chat.app.model.ChatMessage;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ChatController {
    // Handles all the incoming chat requests from client and broadcast to users
    // MessageMapping - when client send message in app/sendMessage, underlying method is called
    // sendTo - used to invoke sendMessage() for all subscribers
    @MessageMapping("/sendMessage")
    @SendTo("/topic/messages")
    public ChatMessage sendMessage(ChatMessage message) {
        return message;
    }

    // Return the thymeleaf template (chat.html) whenever /chat is entered
    @GetMapping("chat")
    public String chat() {
        return "chat";
    }
}

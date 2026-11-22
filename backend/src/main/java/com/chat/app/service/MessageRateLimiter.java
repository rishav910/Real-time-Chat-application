package com.chat.app.service;

import org.springframework.stereotype.Service;
import org.springframework.context.event.EventListener;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MessageRateLimiter {
    private static final int MAX_MESSAGES_PER_MINUTE = 40;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public boolean allow(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return false;
        long now = Instant.now().getEpochSecond();
        Window window = windows.compute(sessionId, (key, current) -> {
            if (current == null || now - current.startedAt >= 60) return new Window(now, 1);
            return new Window(current.startedAt, current.count + 1);
        });
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= 60);
        }
        return window.count <= MAX_MESSAGES_PER_MINUTE;
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        windows.remove(event.getSessionId());
    }

    private record Window(long startedAt, int count) {}
}

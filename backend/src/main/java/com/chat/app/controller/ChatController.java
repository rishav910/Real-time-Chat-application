package com.chat.app.controller;

import com.chat.app.model.ChatMessage;
import com.chat.app.service.MessageRateLimiter;
import com.chat.app.service.UploadService;
import jakarta.validation.Valid;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Controller
public class ChatController {
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageRateLimiter rateLimiter;
    private final UploadService uploadService;
    private final ConcurrentHashMap<String, OwnedMessage> ownedMessages = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Participant> participants = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ConcurrentHashMap<String, String>> seenBy = new ConcurrentHashMap<>();

    public ChatController(SimpMessagingTemplate messagingTemplate, MessageRateLimiter rateLimiter, UploadService uploadService) {
        this.messagingTemplate = messagingTemplate;
        this.rateLimiter = rateLimiter;
        this.uploadService = uploadService;
    }

    // Handles all the incoming chat requests from client and broadcast to users
    // MessageMapping - when client send message in app/sendMessage, underlying method is called
    @MessageMapping("/sendMessage")
    public void sendMessage(@Valid ChatMessage message, SimpMessageHeaderAccessor headers) {
        if (!rateLimiter.allow(headers.getSessionId())) return;
        boolean hasAttachment = message.getAttachmentUrl() != null && message.getAttachmentType() != null;
        boolean hasContent = message.getContent() != null && !message.getContent().isBlank();
        if ((!hasContent && !hasAttachment)
                || ((message.getAttachmentUrl() == null) != (message.getAttachmentType() == null))
                || (hasAttachment && !attachmentTypeMatchesUrl(message.getAttachmentUrl(), message.getAttachmentType()))) {
            return;
        }
        message.setId(null);
        message.setMessageId(UUID.randomUUID().toString());
        message.setDeleted(false);
        message.setEdited(false);
        message.setSeenBy(List.of());
        message.setClientId(message.getClientId().trim());
        message.setSender(message.getSender().trim());
        message.setContent(message.getContent() == null ? "" : message.getContent().trim());
        message.setAttachmentName(message.getAttachmentName() == null ? null : message.getAttachmentName().trim());
        message.setTimestamp(Instant.now());
        ownedMessages.put(message.getMessageId(), new OwnedMessage(message.getRoom(), headers.getSessionId(), message, message.getTimestamp()));
        pruneOwnedMessages();
        messagingTemplate.convertAndSend("/topic/rooms/" + message.getRoom(), message);
    }

    @MessageMapping("/deleteMessage")
    public void deleteMessage(DeleteRequest request, SimpMessageHeaderAccessor headers) {
        if (request == null || request.messageId() == null || request.room() == null
                || !rateLimiter.allow(headers.getSessionId())) return;
        OwnedMessage owned = ownedMessages.get(request.messageId());
        if (owned == null || !owned.room().equals(request.room())
                || !owned.sessionId().equals(headers.getSessionId()) || owned.deleted()) return;

        OwnedMessage deleted = new OwnedMessage(owned.room(), owned.sessionId(), owned.message(), owned.createdAt(), true);
        if (!ownedMessages.replace(request.messageId(), owned, deleted)) return;

        ChatMessage tombstone = new ChatMessage();
        tombstone.setMessageId(request.messageId());
        tombstone.setClientId(owned.message().getClientId());
        tombstone.setSender(owned.message().getSender());
        tombstone.setRoom(owned.room());
        tombstone.setTimestamp(owned.message().getTimestamp());
        tombstone.setContent("");
        tombstone.setDeleted(true);
        messagingTemplate.convertAndSend("/topic/rooms/" + owned.room(), tombstone);
        seenBy.remove(request.messageId());
        uploadService.deleteAttachment(owned.message().getAttachmentUrl());
    }

    @MessageMapping("/join")
    public void join(JoinRequest request, SimpMessageHeaderAccessor headers) {
        if (request == null || request.clientId() == null || request.sender() == null) return;
        String clientId = request.clientId().trim();
        String sender = request.sender().trim();
        if (clientId.isBlank() || clientId.length() > 64 || sender.isBlank() || sender.length() > 32) return;
        participants.put(headers.getSessionId(), new Participant(clientId, sender));
    }

    @MessageMapping("/markSeen")
    public void markSeen(SeenRequest request, SimpMessageHeaderAccessor headers) {
        if (request == null || request.messageId() == null || request.room() == null) return;
        String sessionId = headers.getSessionId();
        Participant participant = participants.get(sessionId);
        OwnedMessage owned = ownedMessages.get(request.messageId());
        if (participant == null || owned == null || owned.deleted() || !owned.room().equals(request.room())
                || owned.sessionId().equals(sessionId)) return;
        ConcurrentHashMap<String, String> readers = seenBy.computeIfAbsent(request.messageId(), ignored -> new ConcurrentHashMap<>());
        if (readers.putIfAbsent(sessionId, participant.name()) == null) publishSeen(request.messageId(), owned.room());
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        participants.remove(event.getSessionId());
        seenBy.forEach((messageId, readers) -> {
            if (readers.remove(event.getSessionId()) != null) {
                OwnedMessage owned = ownedMessages.get(messageId);
                if (owned != null && !owned.deleted()) publishSeen(messageId, owned.room());
                if (readers.isEmpty()) seenBy.remove(messageId, readers);
            }
        });
    }

    private void publishSeen(String messageId, String room) {
        ConcurrentHashMap<String, String> readers = seenBy.get(messageId);
        List<String> names = readers == null ? List.of() : readers.values().stream()
                .distinct().sorted(String.CASE_INSENSITIVE_ORDER).toList();
        messagingTemplate.convertAndSend("/topic/rooms/" + room, new SeenUpdate("seen", messageId, room, names));
    }

    @MessageMapping("/editMessage")
    public void editMessage(EditRequest request, SimpMessageHeaderAccessor headers) {
        if (request == null || request.messageId() == null || request.room() == null || request.content() == null
                || !rateLimiter.allow(headers.getSessionId())) return;
        String content = request.content().trim();
        if (content.isEmpty() || content.length() > 2000) return;

        OwnedMessage current = ownedMessages.get(request.messageId());
        if (current == null || !current.room().equals(request.room())
                || !current.sessionId().equals(headers.getSessionId()) || current.deleted()
                || current.message().getContent().isBlank()) return;

        OwnedMessage updated = new OwnedMessage(current.room(), current.sessionId(), copyEdited(current.message(), content), current.createdAt());
        if (ownedMessages.replace(request.messageId(), current, updated)) {
            messagingTemplate.convertAndSend("/topic/rooms/" + updated.room(), updated.message());
        }
    }

    private ChatMessage copyEdited(ChatMessage original, String content) {
        ChatMessage edited = new ChatMessage();
        edited.setMessageId(original.getMessageId());
        edited.setClientId(original.getClientId());
        edited.setSender(original.getSender());
        edited.setContent(content);
        edited.setAttachmentUrl(original.getAttachmentUrl());
        edited.setAttachmentType(original.getAttachmentType());
        edited.setAttachmentName(original.getAttachmentName());
        edited.setRoom(original.getRoom());
        edited.setTimestamp(original.getTimestamp());
        edited.setEdited(true);
        return edited;
    }

    private void pruneOwnedMessages() {
        if (ownedMessages.size() <= 50_000) return;
        Instant cutoff = Instant.now().minusSeconds(86_400);
        ownedMessages.entrySet().removeIf(entry -> {
            boolean expired = entry.getValue().createdAt().isBefore(cutoff);
            if (expired) seenBy.remove(entry.getKey());
            return expired;
        });
        if (ownedMessages.size() > 50_000) {
            ownedMessages.values().stream()
                    .sorted(Comparator.comparing(OwnedMessage::createdAt))
                    .limit(ownedMessages.size() - 50_000L)
                    .forEach(old -> {
                        String messageId = old.message().getMessageId();
                        if (ownedMessages.remove(messageId, old)) seenBy.remove(messageId);
                    });
        }
    }

    public record DeleteRequest(String messageId, String room) {}

    public record EditRequest(String messageId, String room, String content) {}

    public record JoinRequest(String clientId, String sender) {}

    public record SeenRequest(String messageId, String room) {}

    public record SeenUpdate(String type, String messageId, String room, List<String> seenBy) {}

    private record Participant(String clientId, String name) {}

    private record OwnedMessage(String room, String sessionId, ChatMessage message, Instant createdAt, boolean deleted) {
        private OwnedMessage(String room, String sessionId, ChatMessage message, Instant createdAt) {
            this(room, sessionId, message, createdAt, false);
        }
    }

    private boolean attachmentTypeMatchesUrl(String url, String type) {
        String extension = url.substring(url.lastIndexOf('.') + 1);
        return switch (type) {
            case "image/jpeg" -> extension.equals("jpg");
            case "image/png" -> extension.equals("png");
            case "image/gif" -> extension.equals("gif");
            case "audio/webm" -> extension.equals("webm");
            case "audio/ogg" -> extension.equals("ogg");
            case "audio/mp4" -> extension.equals("m4a");
            case "audio/mpeg" -> extension.equals("mp3");
            default -> false;
        };
    }

    // Return the thymeleaf template (chat.html) whenever /chat is entered
    @GetMapping("chat")
    public String chat() {
        return "chat";
    }
}

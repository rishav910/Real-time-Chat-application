package com.chat.app.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@NoArgsConstructor
public class ChatMessage {
    private Long id;

    private String messageId;

    @NotBlank(message = "A guest identity is required")
    @Size(max = 64, message = "Guest identity is invalid")
    private String clientId;

    @NotBlank(message = "A display name is required")
    @Size(max = 32, message = "Display names must be 32 characters or fewer")
    private String sender;

    @Size(max = 2000, message = "Messages must be 2000 characters or fewer")
    private String content;

    @Pattern(regexp = "/api/uploads/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.(jpg|png|gif|webm|ogg|m4a|mp3)", message = "Attachment URL is invalid")
    private String attachmentUrl;

    @Pattern(regexp = "image/(jpeg|png|gif)|audio/(webm|ogg|mp4|mpeg)", message = "Attachment type is invalid")
    private String attachmentType;

    @Size(max = 120, message = "Attachment name is too long")
    private String attachmentName;

    @NotBlank(message = "A channel is required")
    @Pattern(regexp = "general|random|introductions", message = "Unknown channel")
    private String room;

    private Instant timestamp;

    private boolean deleted;

    private boolean edited;

    private List<String> seenBy;
}

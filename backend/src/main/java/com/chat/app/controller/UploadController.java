package com.chat.app.controller;

import com.chat.app.service.UploadService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.time.Duration;

@RestController
public class UploadController {
    private final UploadService uploadService;

    public UploadController(UploadService uploadService) {
        this.uploadService = uploadService;
    }

    @PostMapping(value = "/api/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadResponse upload(@RequestParam("file") MultipartFile file) {
        UploadService.StoredUpload upload = uploadService.store(file);
        return new UploadResponse(upload.url(), upload.contentType(), upload.originalName());
    }

    @GetMapping("/api/uploads/{fileName}")
    public ResponseEntity<Resource> getUpload(@PathVariable String fileName) {
        Path path = uploadService.resolveStoredFile(fileName);
        if (path == null) return ResponseEntity.notFound().build();

        String contentType = contentTypeFor(fileName);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fileName + "\"")
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(path));
    }

    private String contentTypeFor(String fileName) {
        String extension = fileName.substring(fileName.lastIndexOf('.') + 1);
        return switch (extension) {
            case "jpg" -> "image/jpeg";
            case "png" -> "image/png";
            case "gif" -> "image/gif";
            case "webm" -> "audio/webm";
            case "ogg" -> "audio/ogg";
            case "m4a" -> "audio/mp4";
            case "mp3" -> "audio/mpeg";
            default -> throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND);
        };
    }

    public record UploadResponse(String url, String contentType, String originalName) {}
}

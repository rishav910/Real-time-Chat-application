package com.chat.app.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import java.util.Iterator;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class UploadService {
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;
    private static final long MAX_AUDIO_BYTES = 15L * 1024 * 1024;
    private static final long MAX_IMAGE_PIXELS = 20_000_000L;
    private static final Pattern STORED_NAME = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|gif|webm|ogg|m4a|mp3)");

    private final Path uploadDirectory;
    private final long maxTotalBytes;

    public UploadService(@Value("${chat.upload-dir:uploads}") String uploadDirectory,
                         @Value("${chat.upload-max-total-bytes:1073741824}") long maxTotalBytes) {
        this.uploadDirectory = Path.of(uploadDirectory).toAbsolutePath().normalize();
        this.maxTotalBytes = maxTotalBytes;
    }

    public synchronized StoredUpload store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a file to upload.");
        }

        String contentType = normalizeContentType(file.getContentType());
        boolean image = contentType.startsWith("image/");
        long maxSize = image ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
        if (file.getSize() > maxSize) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    image ? "Images must be 10 MB or smaller." : "Voice messages must be 15 MB or smaller.");
        }
        if (file.getSize() > maxTotalBytes || storedBytes() > maxTotalBytes - file.getSize()) {
            throw new ResponseStatusException(HttpStatus.INSUFFICIENT_STORAGE,
                    "Chat attachments have reached the storage limit.");
        }

        String extension = extensionFor(contentType);
        validateFile(file, contentType);

        String fileName = UUID.randomUUID() + "." + extension;
        try {
            Files.createDirectories(uploadDirectory);
            Path destination = uploadDirectory.resolve(fileName).normalize();
            if (!destination.getParent().equals(uploadDirectory)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name.");
            }
            try (InputStream input = file.getInputStream()) {
                Files.copy(input, destination);
            }
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "The file could not be saved.", exception);
        }

        return new StoredUpload("/api/uploads/" + fileName, contentType, safeOriginalName(file.getOriginalFilename()));
    }

    private long storedBytes() {
        if (!Files.isDirectory(uploadDirectory)) return 0;
        try (Stream<Path> files = Files.list(uploadDirectory)) {
            return files.filter(Files::isRegularFile).mapToLong(path -> {
                try { return Files.size(path); } catch (IOException ignored) { return 0; }
            }).sum();
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Attachment storage is unavailable.", exception);
        }
    }

    public Path resolveStoredFile(String fileName) {
        if (fileName == null || !STORED_NAME.matcher(fileName).matches()) return null;
        Path file = uploadDirectory.resolve(fileName).normalize();
        return file.getParent().equals(uploadDirectory) && Files.isRegularFile(file) ? file : null;
    }

    public void deleteAttachment(String url) {
        if (url == null || !url.startsWith("/api/uploads/")) return;
        Path file = resolveStoredFile(url.substring("/api/uploads/".length()));
        if (file == null) return;
        try {
            Files.deleteIfExists(file);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "The attachment could not be deleted.", exception);
        }
    }

    private void validateFile(MultipartFile file, String contentType) {
        try (InputStream input = file.getInputStream()) {
            byte[] header = input.readNBytes(16);
            switch (contentType) {
                case "image/jpeg" -> require(header.length >= 3 && unsigned(header[0]) == 0xff
                        && unsigned(header[1]) == 0xd8 && unsigned(header[2]) == 0xff, "This is not a JPEG image.");
                case "image/png" -> require(header.length >= 8 && unsigned(header[0]) == 0x89
                        && header[1] == 'P' && header[2] == 'N' && header[3] == 'G', "This is not a PNG image.");
                case "image/gif" -> require(header.length >= 6 && header[0] == 'G' && header[1] == 'I'
                        && header[2] == 'F', "This is not a GIF image.");
                case "audio/webm" -> require(header.length >= 4 && unsigned(header[0]) == 0x1a
                        && unsigned(header[1]) == 0x45 && unsigned(header[2]) == 0xdf
                        && unsigned(header[3]) == 0xa3, "This is not a WebM audio file.");
                case "audio/ogg" -> require(header.length >= 4 && header[0] == 'O' && header[1] == 'g'
                        && header[2] == 'g' && header[3] == 'S', "This is not an Ogg audio file.");
                case "audio/mp4" -> require(header.length >= 8 && header[4] == 'f' && header[5] == 't'
                        && header[6] == 'y' && header[7] == 'p', "This is not an MP4 audio file.");
                case "audio/mpeg" -> require((header.length >= 3 && header[0] == 'I' && header[1] == 'D'
                        && header[2] == '3') || (header.length >= 2 && unsigned(header[0]) == 0xff
                        && (unsigned(header[1]) & 0xe0) == 0xe0), "This is not an MPEG audio file.");
                default -> throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "That file type is not supported.");
            }
            if (contentType.startsWith("image/")) validateImageDimensions(file);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file could not be read.", exception);
        }
    }

    private void validateImageDimensions(MultipartFile file) throws IOException {
        try (InputStream input = file.getInputStream(); ImageInputStream imageInput = ImageIO.createImageInputStream(input)) {
            if (imageInput == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The image could not be read.");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The image could not be read.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(imageInput, true, true);
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (!(format.equals("jpeg") || format.equals("png") || format.equals("gif"))
                        || width < 1 || height < 1 || (long) width * height > MAX_IMAGE_PIXELS) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Images must be JPEG, PNG, or GIF and under 20 megapixels.");
                }
            } finally {
                reader.dispose();
            }
        }
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            case "image/gif" -> "gif";
            case "audio/webm" -> "webm";
            case "audio/ogg" -> "ogg";
            case "audio/mp4" -> "m4a";
            case "audio/mpeg" -> "mp3";
            default -> throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "That file type is not supported.");
        };
    }

    private String normalizeContentType(String contentType) {
        String normalized = contentType == null ? "" : contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!(normalized.equals("image/jpeg") || normalized.equals("image/png") || normalized.equals("image/gif")
                || normalized.equals("audio/webm") || normalized.equals("audio/ogg")
                || normalized.equals("audio/mp4") || normalized.equals("audio/mpeg"))) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Upload a JPEG, PNG, GIF, or supported audio file.");
        }
        return normalized;
    }

    private void require(boolean condition, String message) {
        if (!condition) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private int unsigned(byte value) {
        return value & 0xff;
    }

    private String safeOriginalName(String name) {
        if (name == null || name.isBlank()) return "attachment";
        String baseName = name.replace('\\', '/');
        baseName = baseName.substring(baseName.lastIndexOf('/') + 1)
                .replaceAll("[^\\p{L}\\p{N}._ -]", "_");
        return baseName.substring(0, Math.min(120, baseName.length()));
    }

    public record StoredUpload(String url, String contentType, String originalName) {}
}

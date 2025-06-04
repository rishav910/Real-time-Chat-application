# Dockerfile

# --- Stage 1: Build the Spring Boot Application ---
FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /app

# Copy the Maven wrapper and pom.xml to leverage Docker caching
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .

# NEW: Make mvnw executable INSIDE the Docker container
RUN chmod +x mvnw

# Download dependencies first to speed up subsequent builds if only source code changes
RUN ./mvnw dependency:go-offline -B

# Copy the rest of the source code
COPY src src

# Build the application
RUN ./mvnw clean install -DskipTests

# --- Stage 2: Run the Spring Boot Application ---
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
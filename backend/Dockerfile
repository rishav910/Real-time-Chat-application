# Dockerfile

# --- Stage 1: Build the Spring Boot Application ---
# Use a JDK image for building. Choose a version that matches your project's Java version.
# eclipse-temurin provides OpenJDK builds. 'jammy' refers to Ubuntu 22.04.
FROM eclipse-temurin:21-jdk-jammy AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy the Maven wrapper and pom.xml to leverage Docker caching
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .

# Download dependencies first to speed up subsequent builds if only source code changes
# This step will be cached by Docker if pom.xml doesn't change
RUN ./mvnw dependency:go-offline -B

# Copy the rest of the source code
COPY src src

# Build the application
# -DskipTests: Skips running tests during build (optional, but speeds up deployment builds)
# -Dmaven.compiler.source=21 -Dmaven.compiler.target=21: Explicitly set Java version for compiler (optional, but good practice)
RUN ./mvnw clean install -DskipTests

# --- Stage 2: Run the Spring Boot Application ---
# Use a JRE image for running. JRE images are smaller and more secure for production.
FROM eclipse-temurin:21-jre-jammy

# Set the working directory
WORKDIR /app

# Copy the JAR file from the builder stage
# The name of your JAR file will be something like 'your-app-name-0.0.1-SNAPSHOT.jar'
# You can find the exact name in your target/ (or build/libs/) directory after a local build.
# We use a wildcard here to be flexible.
COPY --from=builder /app/target/*.jar app.jar

# Expose the port your Spring Boot application listens on (default is 8080)
EXPOSE 8080

# Define the command to run your application
ENTRYPOINT ["java", "-jar", "app.jar"]
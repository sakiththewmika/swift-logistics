# dockerfile
FROM maven:3.9.9-eclipse-temurin-21 AS builder
WORKDIR /app

COPY pom.xml mvnw mvnw.cmd ./
COPY .mvn/ .mvn/
RUN chmod +x mvnw

COPY src/ ./src/
# Run full build with CXF codegen
RUN ./mvnw -B clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

ENV SERVER_PORT=8001
EXPOSE 8001
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar app.jar"]
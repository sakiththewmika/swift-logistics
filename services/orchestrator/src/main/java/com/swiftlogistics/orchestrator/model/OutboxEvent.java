package com.swiftlogistics.orchestrator.model;

import com.swiftlogistics.orchestrator.model.enums.OutboxStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "outbox_events")
public class OutboxEvent {
    @Id
    private String id;                 // Used as unique messageId for idempotency
    private String aggregateId;        // orderId
    private String exchange;           // e.g., "order-exchange"
    private String routingKey;         // e.g., "order-created", "warehouse-queue"
    private String payloadJson;        // Serialized JSON of OrderMessage, etc.

    @Indexed
    private OutboxStatus status;       // PENDING, PUBLISHED, FAILED
    private int retryCount;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant publishedAt;
}
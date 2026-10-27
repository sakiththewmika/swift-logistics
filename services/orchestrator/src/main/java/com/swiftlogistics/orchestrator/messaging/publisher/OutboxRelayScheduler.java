package com.swiftlogistics.orchestrator.messaging.publisher;

import com.swiftlogistics.orchestrator.model.OutboxEvent;
import com.swiftlogistics.orchestrator.model.enums.OutboxStatus;
import com.swiftlogistics.orchestrator.repository.OutboxRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import com.swiftlogistics.orchestrator.config.CorrelationIdContext;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
@EnableScheduling
@RequiredArgsConstructor
public class OutboxRelayScheduler {
    private final OutboxRepository outboxRepository;
    private final RabbitTemplate rabbitTemplate;

    @Scheduled(fixedDelay = 1000) // Runs every 1 second
    public synchronized void publishPendingOutboxEvents() {
        List<OutboxEvent> pendingEvents = outboxRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING);

        for (OutboxEvent event : pendingEvents) {
            try {
                rabbitTemplate.invoke(operations -> {
                    MessageProperties properties = new MessageProperties();
                    properties.setMessageId(event.getId());
                    properties.setContentType("application/json");
                    if (event.getCorrelationId() != null) {
                        properties.setHeader(CorrelationIdContext.HEADER_NAME, event.getCorrelationId());
                    }
                    if (event.getTraceparent() != null) {
                        properties.setHeader(CorrelationIdContext.TRACEPARENT_HEADER, event.getTraceparent());
                    }
                    Message message = MessageBuilder.withBody(event.getPayloadJson()
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8))
                            .andProperties(properties)
                            .build();
                    operations.send(
                            event.getExchange(),
                            event.getRoutingKey(),
                            message);
                    operations.waitForConfirmsOrDie(5000);
                    return null;
                });
                event.setStatus(OutboxStatus.PUBLISHED);
                event.setPublishedAt(Instant.now());
            } catch (Exception ex) {
                event.setRetryCount(event.getRetryCount() + 1);
                if (event.getRetryCount() > 5) {
                    event.setStatus(OutboxStatus.FAILED);
                }
            }
            outboxRepository.save(event);
        }
    }
}

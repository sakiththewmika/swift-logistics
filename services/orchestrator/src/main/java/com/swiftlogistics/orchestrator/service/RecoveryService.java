package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.config.RabbitMQConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class RecoveryService {
    private static final Map<String, String> DLQ_TARGETS = Map.of(
            RabbitMQConfig.QUEUE_ORDER_CREATED + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_ORDER_CREATED,
            RabbitMQConfig.QUEUE_BILLING_UPDATES + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_BILLING_UPDATES,
            RabbitMQConfig.QUEUE_BILLING_COMPENSATION + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_BILLING_COMPENSATION,
            RabbitMQConfig.QUEUE_WAREHOUSE_QUEUE + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_WAREHOUSE_QUEUE,
            RabbitMQConfig.QUEUE_WAREHOUSE_UPDATES + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_WAREHOUSE_UPDATES,
            RabbitMQConfig.QUEUE_WAREHOUSE_COMPENSATION + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_WAREHOUSE_COMPENSATION,
            RabbitMQConfig.QUEUE_ROUTE_PLANNING + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_ROUTE_PLANNING,
            RabbitMQConfig.QUEUE_ROUTE_UPDATES + RabbitMQConfig.DLQ_SUFFIX, RabbitMQConfig.QUEUE_ROUTE_UPDATES
    );

    private final RabbitTemplate rabbitTemplate;

    @Scheduled(fixedDelayString = "${recovery.auto-replay-delay-ms:60000}")
    public void autoReplay() {
        if (Boolean.parseBoolean(System.getProperty("recovery.auto-replay-enabled", "false"))) {
            DLQ_TARGETS.keySet().forEach(queue -> replay(queue, 1));
        }
    }

    public int replay(String deadLetterQueue, int limit) {
        String targetQueue = DLQ_TARGETS.get(deadLetterQueue);
        if (targetQueue == null) {
            throw new IllegalArgumentException("Unsupported dead-letter queue: " + deadLetterQueue);
        }
        int replayed = 0;
        for (int i = 0; i < Math.max(0, limit); i++) {
            Message message = rabbitTemplate.receive(deadLetterQueue);
            if (message == null) {
                break;
            }
            rabbitTemplate.send("", targetQueue, message);
            replayed++;
        }
        if (replayed > 0) {
            log.info("Replayed {} message(s) from {} to {}", replayed, deadLetterQueue, targetQueue);
        }
        return replayed;
    }
}

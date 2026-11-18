package com.swiftlogistics.orchestrator.messaging.subscriber;

import com.swiftlogistics.orchestrator.config.RabbitMQConfig;
import com.swiftlogistics.orchestrator.dto.WarehouseUpdateMessage;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.service.OrderService;
import com.swiftlogistics.orchestrator.service.EventService;
import com.swiftlogistics.orchestrator.service.StatusMessages;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;
import org.springframework.messaging.handler.annotation.Header;
import com.swiftlogistics.orchestrator.config.CorrelationIdContext;

/**
 * Step 3: Warehouse Update Subscriber
 * Handles updates from WMS Adapter when packages are ready
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WarehouseSubscriber {

    private final OrderService orderService;
    private final EventService eventService;
    private final SsePublisher ssePublisher;

    @RabbitListener(queues = RabbitMQConfig.QUEUE_WAREHOUSE_UPDATES)
    public void handleWarehouseUpdate(WarehouseUpdateMessage warehouseUpdate,
                                      @Header(name = "X-Correlation-Id", required = false) String correlationId,
                                      @Header(name = "traceparent", required = false) String traceparent) {
        CorrelationIdContext.setFromHeaders(correlationId, traceparent);
        try {
            log.info("Received warehouse update: orderId={}, status={}",
                    warehouseUpdate.getOrderId(), warehouseUpdate.getStatus());

            orderService.processWarehouseUpdate(warehouseUpdate).ifPresent(status ->
                    ssePublisher.publishOrderStatusUpdate(warehouseUpdate.getOrderId(), status,
                            StatusMessages.describe(status)));
            CorrelationIdContext.clear();

        } catch (Exception e) {
            CorrelationIdContext.clear();
            log.error("Error processing warehouse update: orderId={}",
                    warehouseUpdate.getOrderId(), e);
            
            // Log failure event
            eventService.logFailedEvent(warehouseUpdate.getOrderId(),
                    EventType.WAREHOUSE_FAILED, EventSource.WMS_ADAPTER,
                    "Failed to process warehouse update: " + e.getMessage());
            throw new IllegalStateException("Warehouse update processing failed", e);
        }
    }

}

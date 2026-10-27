package com.swiftlogistics.orchestrator.messaging.subscriber;

import com.swiftlogistics.orchestrator.config.RabbitMQConfig;
import com.swiftlogistics.orchestrator.dto.BillingUpdateMessage;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.service.OrderService;
import com.swiftlogistics.orchestrator.service.EventService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;
import org.springframework.messaging.handler.annotation.Header;
import com.swiftlogistics.orchestrator.config.CorrelationIdContext;

@Service
@RequiredArgsConstructor
@Slf4j
public class BillingUpdateSubscriber {

    private final OrderService orderService;
    private final EventService eventService;
    private final SsePublisher ssePublisher;

    /**
     * Step 2: Listen for billing updates from CMS Adapter
     * When billing is completed, update order status and trigger warehouse processing
     */
    @RabbitListener(queues = RabbitMQConfig.QUEUE_BILLING_UPDATES)
    public void handleBillingUpdate(BillingUpdateMessage billingUpdate,
                                    @Header(name = "X-Correlation-Id", required = false) String correlationId,
                                    @Header(name = "traceparent", required = false) String traceparent) {
        CorrelationIdContext.setFromHeaders(correlationId, traceparent);
        try {
            log.info("Received billing update: orderId={}, status={}",
                    billingUpdate.getOrderId(), billingUpdate.getStatus());

            orderService.processBillingUpdate(billingUpdate);
            if ("BILLED".equals(billingUpdate.getStatus())) {
                ssePublisher.publishOrderStatusUpdate(billingUpdate.getOrderId(), OrderStatus.BILLED,
                        "Billing completed successfully");
            } else if ("FAILED".equals(billingUpdate.getStatus())) {
                ssePublisher.publishOrderStatusUpdate(billingUpdate.getOrderId(), OrderStatus.BILLING_FAILED,
                        "Billing failed");
            } else if ("PENDING".equals(billingUpdate.getStatus())) {
                ssePublisher.publishOrderStatusUpdate(billingUpdate.getOrderId(), OrderStatus.BILLING_PENDING,
                        "Billing is pending");
            }
            CorrelationIdContext.clear();

        } catch (Exception e) {
            CorrelationIdContext.clear();
            log.error("Error processing billing update: orderId={}",
                    billingUpdate.getOrderId(), e);
            
            // Log failure event
            eventService.logFailedEvent(
                    billingUpdate.getOrderId(), EventType.BILLING_FAILED,
                    EventSource.ORCHESTRATOR, "Failed to process billing update: " + e.getMessage()
            );
            throw new IllegalStateException("Billing update processing failed", e);
        }
    }

}
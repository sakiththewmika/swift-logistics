package com.swiftlogistics.orchestrator.messaging.subscriber;

import com.swiftlogistics.orchestrator.config.RabbitMQConfig;
import com.swiftlogistics.orchestrator.dto.RouteUpdateMessage;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.service.OrderService;
import com.swiftlogistics.orchestrator.service.EventService;
import com.swiftlogistics.orchestrator.service.RouteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;

/**
 * Route Subscriber - Step 4 of Optimized Event-Driven Flow
 * Handles route planning updates and driver assignment preparation
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RouteSubscriber {

    private final OrderService orderService;
    private final RouteService routeService;
    private final EventService eventService;
    private final SsePublisher ssePublisher;

    @RabbitListener(queues = RabbitMQConfig.QUEUE_ROUTE_UPDATES)
    @Retryable(
        value = {Exception.class},
        maxAttempts = 3,
        backoff = @Backoff(delay = 2000)
    )
    public void processRouteUpdate(RouteUpdateMessage routeUpdate) throws Exception {
        try {
            log.info("Received route update: orderId={}, status={}",
                    routeUpdate.getOrderId(), routeUpdate.getStatus());

            orderService.processRouteUpdate(routeUpdate, routeService);
            if ("ROUTED".equalsIgnoreCase(routeUpdate.getStatus())) {
                ssePublisher.publishOrderStatusUpdate(routeUpdate.getOrderId(), OrderStatus.ROUTED,
                        "Route created successfully");
            } else if ("FAILED".equalsIgnoreCase(routeUpdate.getStatus())) {
                ssePublisher.publishOrderStatusUpdate(routeUpdate.getOrderId(), OrderStatus.ROUTE_FAILED,
                        "Route planning failed");
            } else if ("ROUTING".equalsIgnoreCase(routeUpdate.getStatus())) {
                ssePublisher.publishOrderStatusUpdate(routeUpdate.getOrderId(), OrderStatus.ROUTING,
                        "Route planning is in progress");
            }

            log.info("Route update processed successfully for order: {}", routeUpdate.getOrderId());

        } catch (Exception e) {
            log.error("Error processing route update for order: {}", routeUpdate.getOrderId(), e);
            
            eventService.logFailedEvent(
                routeUpdate.getOrderId(),
                    EventType.ROUTE_FAILED,
                    EventSource.ROS_ADAPTER,
                "Failed to process route update: " + e.getMessage()
            );
            throw new IllegalStateException("Route update processing failed", e);
        }
    }

}

package com.swiftlogistics.orchestrator.messaging.publisher;

import com.swiftlogistics.orchestrator.controller.SseController;
import com.swiftlogistics.orchestrator.dto.DriverUpdateMessage;
import com.swiftlogistics.orchestrator.dto.OrderStatusMessage;
import com.swiftlogistics.orchestrator.dto.TelematicsMessage;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.Route;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.repository.RouteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class SsePublisher {

    private final SseController sseController;
    private final RouteRepository routeRepository;
    private final OrderRepository orderRepository;

    /**
     * Publish order status updates via SSE
     */
    public void publishOrderStatusUpdate(String orderId, OrderStatus status, String message) {
        try {
            SseEmitter emitter = sseController.getOrderEmitters().get(orderId);

            if (emitter != null) {
                OrderStatusMessage orderMessage = OrderStatusMessage.builder()
                        .orderId(orderId)
                        .status(status)
                        .message(message)
                        .timestamp(LocalDateTime.now())
                        .build();

                emitter.send(SseEmitter.event()
                        .name("order-update")
                        .id(String.valueOf(System.currentTimeMillis()))
                        .data(orderMessage));

                log.info("Published Order Status Update via SSE: orderId={}, status={}", orderId, status);
            } else {
                log.debug("No active SSE connection for order: {}", orderId);
            }
        } catch (IOException | IllegalStateException e) {
            log.error("Failed to publish Order Status Update via SSE: orderId={}, status={}", orderId, status, e);
            // Remove the emitter if there's an error (likely disconnected client)
            sseController.getOrderEmitters().remove(orderId);
        }
    }

    public void publishLocationUpdate(TelematicsMessage telemetry) {
            SseEmitter emitter = sseController.getOrderEmitters().get(telemetry.getOrderId());
            if (emitter == null) {
                return;
            }
            try {
                emitter.send(SseEmitter.event()
                        .name("location-update")
                        .id(String.valueOf(System.currentTimeMillis()))
                        .data(telemetry));
            } catch (IOException | IllegalStateException e) {
                log.warn("Removing disconnected location SSE client for order {}",
                        telemetry.getOrderId(), e);
                sseController.getOrderEmitters().remove(telemetry.getOrderId());
        }
    }
}
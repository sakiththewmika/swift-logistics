package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.dto.TelematicsMessage;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;

@Controller
@RequiredArgsConstructor
@Slf4j
public class TelematicsController {

    private final SimpMessagingTemplate messagingTemplate;
    private final SsePublisher ssePublisher;

    @MessageMapping("/telemetry")
    public void receiveTelemetry(TelematicsMessage message) {
        if (message.getDriverId() == null || message.getLatitude() == null
                || message.getLongitude() == null) {
            log.warn("Ignoring telemetry without driver and coordinates");
            return;
        }
        if (message.getTimestamp() == null) {
            message.setTimestamp(LocalDateTime.now());
        }

        messagingTemplate.convertAndSend(
                "/topic/drivers/" + message.getDriverId() + "/location", message);
        if (message.getOrderId() != null) {
            messagingTemplate.convertAndSend(
                    "/topic/orders/" + message.getOrderId() + "/location", message);
            ssePublisher.publishLocationUpdate(message);
        }
    }
}

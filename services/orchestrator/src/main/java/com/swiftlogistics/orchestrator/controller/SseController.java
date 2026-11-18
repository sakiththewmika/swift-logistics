package com.swiftlogistics.orchestrator.controller;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequiredArgsConstructor
//@RequestMapping("/api/v1/sse")
@Slf4j
public class SseController {

    // Store active emitters
    @Getter
    private final Map<String, SseEmitter> orderEmitters = new ConcurrentHashMap<>();

    // SSE endpoint for order updates
    @GetMapping(value = "/sse/order/{orderId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeOrder(
            @PathVariable String orderId,
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {

        log.info("Order SSE connection requested: orderId={}, lastEventId={}", orderId, lastEventId);

        SseEmitter emitter = new SseEmitter(500_000L); // ~8.3 minutes; browsers reconnect automatically
        orderEmitters.put(orderId, emitter);

        emitter.onCompletion(() -> {
            log.info("SSE connection completed for order: {}", orderId);
            orderEmitters.remove(orderId, emitter);
        });

        emitter.onTimeout(() -> {
            log.info("SSE connection timed out for order: {}", orderId);
            orderEmitters.remove(orderId, emitter);
        });

        emitter.onError((e) -> {
            log.error("SSE connection error for order: {}", orderId, e);
            orderEmitters.remove(orderId, emitter);
        });

        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data("Connection established for order: " + orderId));
        } catch (IOException e) {
            log.error("Failed to send initial SSE message to order: {}", orderId, e);
        }

        return emitter;
    }

}
package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.dto.CreateOrderRequest;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.Event;
import com.swiftlogistics.orchestrator.service.OrderService;
import com.swiftlogistics.orchestrator.service.EventService;
import com.swiftlogistics.orchestrator.model.IdempotencyRecord;
import com.swiftlogistics.orchestrator.repository.IdempotencyRecordRepository;
import com.swiftlogistics.orchestrator.security.AccessGuard;
import jakarta.validation.Valid;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.time.Instant;

/**
 * Order Controller - Optimized Event-Driven Flow API
 * Provides REST endpoints for the 6-step orchestration flow
 */
@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Slf4j
public class OrderController {

    private final OrderService orderService;
    private final EventService eventService;
    private final IdempotencyRecordRepository idempotencyRecordRepository;

    /**
     * Create a new order
     */
    @PostMapping
    public ResponseEntity<Order> createOrder(
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CreateOrderRequest request) {
        log.info("Creating new order for customer: {}", request.getCustomerId());

        AccessGuard.requireAnyRole(AccessGuard.ROLE_CUSTOMER, AccessGuard.ROLE_ADMIN);
        AccessGuard.requireOwnerOrAdmin(request.getCustomerId());

        try {
            if (idempotencyKey == null || idempotencyKey.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Idempotency-Key header is required");
            }
            IdempotencyRecord record = new IdempotencyRecord(idempotencyKey, null, Instant.now());
            try {
                idempotencyRecordRepository.insert(record);
            } catch (DuplicateKeyException duplicate) {
                IdempotencyRecord existing = idempotencyRecordRepository.findById(idempotencyKey)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                                "Idempotency key is currently being processed"));
                if (existing.getOrderId() == null) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Idempotency key is currently being processed");
                }
                return orderService.getOrder(existing.getOrderId())
                        .map(existingOrder -> {
                            AccessGuard.requireOrderAccess(existingOrder.getCustomerId(), existingOrder.getDriverId());
                            return ResponseEntity.ok(existingOrder);
                        })
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                                "Idempotency key points to an unavailable order"));
            }
            Order order = orderService.createOrder(request);
            record.setOrderId(order.getOrderId());
            idempotencyRecordRepository.save(record);
            return ResponseEntity.status(HttpStatus.CREATED).body(order);

        } catch (Exception e) {
            if (e instanceof ResponseStatusException responseStatusException) {
                throw responseStatusException;
            }
            if (idempotencyKey != null && !idempotencyKey.isBlank()) {
                idempotencyRecordRepository.findById(idempotencyKey)
                        .filter(record -> record.getOrderId() == null)
                        .ifPresent(record -> idempotencyRecordRepository.deleteById(idempotencyKey));
            }
            log.error("Failed to create order for customer: {}", request.getCustomerId(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create order");
        }
    }

    /**
     * Get order by ID
     */
    @GetMapping("/{orderId}")
    public ResponseEntity<Order> getOrder(@PathVariable String orderId) {
        Order order = orderService.getOrder(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        AccessGuard.requireOrderAccess(order.getCustomerId(), order.getDriverId());
        return ResponseEntity.ok(order);
    }

    /**
     * Get orders by customer ID
     */
    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<Order>> getOrdersByCustomer(@PathVariable String customerId) {
        AccessGuard.requireAnyRole(AccessGuard.ROLE_CUSTOMER, AccessGuard.ROLE_ADMIN);
        AccessGuard.requireOwnerOrAdmin(customerId);
        List<Order> orders = orderService.getOrdersByCustomer(customerId);
        return ResponseEntity.ok(orders);
    }

    /**
     * Get order events/audit trail
     */
    @GetMapping("/{orderId}/events")
    public ResponseEntity<List<Event>> getOrderEvents(@PathVariable String orderId) {
        Order order = orderService.getOrder(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        AccessGuard.requireOrderAccess(order.getCustomerId(), order.getDriverId());
        try {
            List<Event> events = eventService.getOrderEvents(orderId);
            return ResponseEntity.ok(events);
        } catch (Exception e) {
            log.error("Failed to retrieve events for order: {}", orderId, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve order events");
        }
    }

    /**
     * Health check endpoint
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "UP",
            "service", "Orchestrator",
            "version", "1.0.0-OPTIMIZED"
        ));
    }
}

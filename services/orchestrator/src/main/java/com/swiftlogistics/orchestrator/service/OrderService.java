package com.swiftlogistics.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftlogistics.orchestrator.dto.CreateOrderRequest;
import com.swiftlogistics.orchestrator.dto.RouteRequestMessage;
import com.swiftlogistics.orchestrator.model.Customer;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.dto.OrderMessage;
import com.swiftlogistics.orchestrator.dto.WarehouseRequestMessage;
import com.swiftlogistics.orchestrator.dto.CompensateBillingMessage;
import com.swiftlogistics.orchestrator.dto.CompensateWarehouseMessage;
import com.swiftlogistics.orchestrator.model.OutboxEvent;
import com.swiftlogistics.orchestrator.model.ProcessedMessage;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.model.enums.OutboxStatus;
import com.swiftlogistics.orchestrator.repository.CustomerRepository;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.messaging.publisher.OrderPublisher;
import com.swiftlogistics.orchestrator.repository.OutboxRepository;
import com.swiftlogistics.orchestrator.repository.ProcessedMessageRepository;
import com.swiftlogistics.orchestrator.config.CorrelationIdContext;
import org.springframework.dao.DuplicateKeyException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final CustomerRepository customerRepository;
    private final OutboxRepository outboxRepository;
    private final OrderPublisher orderPublisher;
    private final EventService eventService;
    private final ObjectMapper objectMapper;
    private final ProcessedMessageRepository processedMessageRepository;

    /**
     * Step 1: Create a new order and publish to order-created queue
     */
    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        try {
            // Create order entity
            Order order = Order.builder()
                    .customerId(request.getCustomerId())
                    .deliveryAddress(request.getDeliveryAddress())
                    .city(request.getCity())
                    .postalCode(request.getPostalCode())
                    .country(request.getCountry())
                    .totalAmount(request.getTotalAmount())
                    .status(OrderStatus.NEW)
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();

            // Save to MongoDB
            Order savedOrder = orderRepository.save(order);
            
            // Log order creation event
            eventService.logSuccessEvent(
                    savedOrder.getOrderId(), EventType.ORDER_CREATED, EventSource.ORCHESTRATOR, "Order created successfully"
            );

            // Get customer details
            Customer customer = customerRepository.findById(request.getCustomerId())
                    .orElseThrow();

            // Create message for CMS Adapter (billing)
            OrderMessage orderMessage = OrderMessage.builder()
                    .orderId(savedOrder.getOrderId())
                    .customerId(savedOrder.getCustomerId())
                    .customerName(customer.getCustomerName())
                    .customerEmail(customer.getCustomerEmail())
                    .deliveryAddress(savedOrder.getDeliveryAddress())
                    .city(savedOrder.getCity())
                    .postalCode(savedOrder.getPostalCode())
                    .country(savedOrder.getCountry())
                    .totalAmount(savedOrder.getTotalAmount())
                    .timestamp(LocalDateTime.now())
                    .build();

            // Save to outbox for idempotency and async processing
            OutboxEvent outbox = OutboxEvent.builder()
                    .id(orderMessage.getMessageId())
                    .aggregateId(order.getId())
                    .exchange(com.swiftlogistics.orchestrator.config.RabbitMQConfig.EXCHANGE_ORDER_CREATED)
                    .routingKey(com.swiftlogistics.orchestrator.config.RabbitMQConfig.ROUTING_KEY_ORDER_CREATED)
                    .payloadJson(objectMapper.writeValueAsString(orderMessage))
                    .correlationId(CorrelationIdContext.getOrCreateCorrelationId())
                    .traceparent(CorrelationIdContext.getTraceparent())
                    .status(OutboxStatus.PENDING)
                    .createdAt(Instant.now())
                    .build();
            outboxRepository.save(outbox);

            log.info("Order created successfully: orderId={}",
                    savedOrder.getOrderId());

            return savedOrder;

        } catch (Exception e) {
            log.error("Failed to create order: customerId={}", request.getCustomerId(), e);
            throw new RuntimeException("Failed to create order", e);
        }
    }

    /**
     * Moves an order to {@code target} if the state machine allows it. Out-of-order or
     * repeated events are ignored and reported as an empty result so callers can skip side
     * effects (events, outbox messages, client notifications).
     *
     * @param onTransition optional hook applied to the order only when the transition happens
     * @return the new status when a transition happened, otherwise empty
     */
    private Optional<OrderStatus> applyTransition(String orderId, OrderStatus target, Consumer<Order> onTransition) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found: " + orderId));
        OrderStatus current = order.getStatus() == null ? OrderStatus.NEW : order.getStatus();
        if (current == target) {
            log.info("Ignoring duplicate status change: orderId={}, status={}", orderId, target);
            return Optional.empty();
        }
        if (!OrderStateMachine.canTransition(current, target)) {
            log.warn("Ignoring out-of-order status change: orderId={}, {} -> {}", orderId, current, target);
            return Optional.empty();
        }
        order.setStatus(target);
        order.setUpdatedAt(LocalDateTime.now());
        if (onTransition != null) {
            onTransition.accept(order);
        }
        orderRepository.save(order);
        log.info("Order status updated: orderId={}, {} -> {}", orderId, current, target);
        return Optional.of(target);
    }

    @Transactional
    public Optional<OrderStatus> updateOrderStatus(String orderId, OrderStatus status) {
        return applyTransition(orderId, status, null);
    }

    /**
     * Applies a billing-driven transition. The order's {@code totalAmount} is only replaced by a
     * billed amount reported by billing; failures and refunds never zero it out.
     */
    @Transactional
    public Optional<OrderStatus> updateOrderStatus(String orderId, OrderStatus status, String billingStatus,
                                                   Double billedAmount) {
        return applyTransition(orderId, status, order -> {
            order.setBillingStatus(billingStatus);
            if (status == OrderStatus.BILLED) {
                order.setBilledAt(LocalDateTime.now());
                if (billedAmount != null && billedAmount > 0) {
                    order.setTotalAmount(billedAmount);
                }
            }
        });
    }

    /**
     * Step 3: Send order to warehouse after billing completion
     */
    public void sendToWarehouse(String orderId) {
        try {
            Optional<Order> orderOpt = orderRepository.findById(orderId);
            if (orderOpt.isEmpty()) {
                throw new RuntimeException("Order not found: " + orderId);
            }

            Order order = orderOpt.get();
            
            // Create warehouse request message
            WarehouseRequestMessage warehouseRequest = WarehouseRequestMessage.builder()
                    .orderId(orderId)
                    .customerId(order.getCustomerId())
                    .deliveryAddress(order.getDeliveryAddress())
                    .city(order.getCity())
                    .postalCode(order.getPostalCode())
                    .country(order.getCountry())
                    .totalAmount(order.getTotalAmount())
                    .status("BILLED")
                    .timestamp(LocalDateTime.now())
                    .build();

            // Publish to warehouse queue for WMS Adapter
            enqueue(warehouseRequest, orderId,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.EXCHANGE_WAREHOUSE,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.ROUTING_KEY_WAREHOUSE_REQUEST);
            
            // Log event
            eventService.logSuccessEvent(
                    orderId, EventType.ORDER_SENT_TO_WMS, EventSource.ORCHESTRATOR, "Order sent to WMS for processing"
            );

            log.info("Order sent to warehouse: orderId={}", orderId);

        } catch (Exception e) {
            log.error("Failed to send order to warehouse: orderId={}", orderId, e);
            eventService.logFailedEvent(
                    orderId, EventType.ORDER_SENT_TO_WMS, EventSource.ORCHESTRATOR, "Failed to send order to WMS"
            );
            throw e;
        }
    }

    /**
     * Step 4: Request route planning after warehouse processing
     */
    public void requestRoutePlanning(String orderId) {
        try {
            Optional<Order> orderOpt = orderRepository.findById(orderId);
            if (orderOpt.isEmpty()) {
                throw new RuntimeException("Order not found: " + orderId);
            }

            Order order = orderOpt.get();
            
            // Create route planning request
            RouteRequestMessage routeRequest = RouteRequestMessage.builder()
                    .messageId(java.util.UUID.randomUUID().toString())
                    .orderId(orderId)
                    .deliveryAddress(order.getDeliveryAddress())
                    .city(order.getCity())
                    .postalCode(order.getPostalCode())
                    .country(order.getCountry())
                    .build();

            // Publish to route planning queue for ROS Adapter
            enqueue(routeRequest, orderId,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.EXCHANGE_ROUTE,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.ROUTING_KEY_ROUTE_PLANNING);
            
            // Log event
            eventService.logSuccessEvent(
                    orderId, EventType.ORDER_SENT_TO_ROS, EventSource.ORCHESTRATOR, "Route planning requested"
            );

            log.info("Route planning requested: orderId={}", orderId);

        } catch (Exception e) {
            log.error("Failed to request route planning: orderId={}", orderId, e);
            eventService.logFailedEvent(
                    orderId, EventType.ORDER_SENT_TO_ROS, EventSource.ORCHESTRATOR, "Failed to request route planning"
            );
            throw e;
        }
    }

    /**
     * Get order by ID
     */
    public Optional<Order> getOrder(String orderId) {
        return orderRepository.findById(orderId);
    }

    /**
     * Get orders by customer
     */
    public List<Order> getOrdersByCustomer(String customerId) {
        return orderRepository.findByCustomerId(customerId);
    }

    @Transactional
    public boolean markMessageProcessed(String messageId) {
        if (messageId == null || messageId.isBlank()) {
            return false;
        }
        try {
            processedMessageRepository.insert(new ProcessedMessage(messageId, Instant.now()));
            return true;
        } catch (DuplicateKeyException duplicate) {
            return false;
        }
    }

    @Transactional
    public Optional<OrderStatus> processBillingUpdate(com.swiftlogistics.orchestrator.dto.BillingUpdateMessage update) {
        String status = update.getStatus() == null ? "UNKNOWN" : update.getStatus().trim().toUpperCase();
        if (!markMessageProcessed(update.getOrderId() + ":BILLING_UPDATE:" + status)) return Optional.empty();
        String orderId = update.getOrderId();
        Optional<OrderStatus> result;
        switch (status) {
            case "BILLED" -> {
                result = updateOrderStatus(orderId, OrderStatus.BILLED, "COMPLETED", update.getBilledAmount());
                if (result.isPresent()) {
                    eventService.logSuccessEvent(orderId, EventType.BILLING_COMPLETED,
                            EventSource.CMS_ADAPTER, "Billing completed successfully");
                    sendToWarehouse(orderId);
                }
            }
            case "FAILED" -> {
                result = updateOrderStatus(orderId, OrderStatus.BILLING_FAILED, "FAILED", null);
                result.ifPresent(s -> eventService.logFailedEvent(orderId, EventType.BILLING_FAILED,
                        EventSource.CMS_ADAPTER, "Billing failed"));
            }
            case "PENDING" -> {
                result = updateOrderStatus(orderId, OrderStatus.BILLING_PENDING, "PENDING", null);
                result.ifPresent(s -> eventService.logPendingEvent(orderId, EventType.BILLING_PENDING,
                        EventSource.CMS_ADAPTER, "Billing is pending"));
            }
            case "CANCELLED_REFUNDED", "BILLING_REFUNDED" -> {
                result = updateOrderStatus(orderId, OrderStatus.CANCELLED_REFUNDED, "CANCELLED_REFUNDED", null);
                String description = "BILLING_REFUNDED".equals(status)
                        ? "Billing compensation completed" : "Billing cancelled and refunded";
                result.ifPresent(s -> eventService.logSuccessEvent(orderId, EventType.ORDER_CANCELLED,
                        EventSource.CMS_ADAPTER, description));
            }
            default -> throw new IllegalArgumentException("Unknown billing status: " + update.getStatus());
        }
        return result;
    }

    @Transactional
    public Optional<OrderStatus> processWarehouseUpdate(com.swiftlogistics.orchestrator.dto.WarehouseUpdateMessage update) {
        String status = update.getStatus() == null ? "" : update.getStatus().trim().toUpperCase();
        if (!markMessageProcessed(update.getOrderId() + ":WAREHOUSE_UPDATE:" + status)) return Optional.empty();
        String orderId = update.getOrderId();
        switch (status) {
            case "FAILED" -> {
                if (updateOrderStatus(orderId, OrderStatus.WAREHOUSE_FAILED).isEmpty()) {
                    return Optional.empty();
                }
                eventService.logFailedEvent(orderId, EventType.WAREHOUSE_FAILED,
                        EventSource.WMS_ADAPTER, "Warehouse processing failed");
                return beginBillingCompensation(orderId, "Warehouse processing failed");
            }
            case "COMPENSATED", "PACKAGE_RELEASED", "WAREHOUSE_COMPENSATED" -> {
                // Only meaningful while the warehouse release we asked for is outstanding.
                if (!isInStatus(orderId, OrderStatus.COMPENSATING_WAREHOUSE)) {
                    log.warn("Ignoring unexpected warehouse compensation ack: orderId={}", orderId);
                    return Optional.empty();
                }
                eventService.logSuccessEvent(orderId, EventType.WAREHOUSE_FAILED,
                        EventSource.WMS_ADAPTER, "Warehouse compensation completed");
                return beginBillingCompensation(orderId, "Warehouse compensation completed");
            }
            case "PROCESSING" -> {
                Optional<OrderStatus> result = updateOrderStatus(orderId, OrderStatus.PROCESSING);
                result.ifPresent(s -> eventService.logPendingEvent(orderId, EventType.WAREHOUSE_PROCESSING,
                        EventSource.WMS_ADAPTER, "Warehouse processing in progress"));
                return result;
            }
            case "READY" -> {
                Optional<OrderStatus> result = applyTransition(orderId, OrderStatus.READY,
                        order -> order.setPackageReadyAt(LocalDateTime.now()));
                if (result.isPresent()) {
                    eventService.logSuccessEvent(orderId, EventType.PACKAGE_READY,
                            EventSource.WMS_ADAPTER, "Package is ready for shipment");
                    requestRoutePlanning(orderId);
                }
                return result;
            }
            default -> throw new IllegalArgumentException("Unknown warehouse status: " + update.getStatus());
        }
    }

    private boolean isInStatus(String orderId, OrderStatus expected) {
        return orderRepository.findById(orderId)
                .map(order -> order.getStatus() == expected)
                .orElse(false);
    }

    /** Starts releasing the warehouse package; empty (and no message queued) if not legal from the current status. */
    @Transactional
    public Optional<OrderStatus> beginWarehouseCompensation(String orderId, String reason) {
        Optional<OrderStatus> result = updateOrderStatus(orderId, OrderStatus.COMPENSATING_WAREHOUSE);
        if (result.isPresent()) {
            CompensateWarehouseMessage compensation = CompensateWarehouseMessage.builder()
                    .messageId(java.util.UUID.randomUUID().toString())
                    .orderId(orderId)
                    .reason(reason)
                    .timestamp(java.time.LocalDateTime.now())
                    .build();
            enqueue(compensation, orderId,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.EXCHANGE_WAREHOUSE,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.ROUTING_KEY_WAREHOUSE_COMPENSATION);
        }
        return result;
    }

    /** Starts refunding billing; empty (and no message queued) if not legal from the current status. */
    @Transactional
    public Optional<OrderStatus> beginBillingCompensation(String orderId, String reason) {
        Optional<OrderStatus> result = updateOrderStatus(orderId, OrderStatus.COMPENSATING_BILLING);
        if (result.isPresent()) {
            CompensateBillingMessage compensation = CompensateBillingMessage.builder()
                    .messageId(java.util.UUID.randomUUID().toString())
                    .orderId(orderId)
                    .reason(reason)
                    .timestamp(java.time.LocalDateTime.now())
                    .build();
            enqueue(compensation, orderId,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.EXCHANGE_BILLING_UPDATES,
                    com.swiftlogistics.orchestrator.config.RabbitMQConfig.ROUTING_KEY_BILLING_COMPENSATION);
        }
        return result;
    }

    /**
     * Handles a route-planning result. A failed route marks the order {@code ROUTE_FAILED}, logs it,
     * moves it to {@code COMPENSATING_WAREHOUSE} and queues the warehouse release in this one
     * transaction, so a crash can never leave a failed route without its compensation.
     */
    @Transactional
    public Optional<OrderStatus> processRouteUpdate(com.swiftlogistics.orchestrator.dto.RouteUpdateMessage update,
                                                    RouteService routeService) {
        String status = update.getStatus() == null ? "" : update.getStatus().trim().toUpperCase();
        if (!markMessageProcessed(update.getOrderId() + ":ROUTE_UPDATE:" + status)) return Optional.empty();
        String orderId = update.getOrderId();
        switch (status) {
            case "ROUTED" -> {
                OrderStatus current = orderRepository.findById(orderId)
                        .orElseThrow(() -> new RuntimeException("Order not found: " + orderId))
                        .getStatus();
                if (!OrderStateMachine.canTransition(current, OrderStatus.ROUTED)) {
                    log.warn("Ignoring out-of-order route result: orderId={}, current={}", orderId, current);
                    return Optional.empty();
                }
                routeService.createOrderRoute(orderId, update.getWaypoints(),
                        update.getDriverId(), update.getVehicleId());
                return Optional.of(OrderStatus.ROUTED);
            }
            case "FAILED" -> {
                if (updateOrderStatus(orderId, OrderStatus.ROUTE_FAILED).isEmpty()) {
                    return Optional.empty();
                }
                eventService.logFailedEvent(orderId, EventType.ROUTE_FAILED,
                        EventSource.ROS_ADAPTER, "Route planning failed");
                return beginWarehouseCompensation(orderId, "Route planning failed");
            }
            case "ROUTING" -> {
                Optional<OrderStatus> result = updateOrderStatus(orderId, OrderStatus.ROUTING);
                result.ifPresent(s -> eventService.logPendingEvent(orderId, EventType.ROUTE_PENDING,
                        EventSource.ROS_ADAPTER, "Route planning is in progress"));
                return result;
            }
            default -> throw new IllegalArgumentException("Unknown route status: " + update.getStatus());
        }
    }

    private void enqueue(Object payload, String aggregateId, String exchange, String routingKey) {
        try {
            outboxRepository.save(OutboxEvent.builder()
                    .id(java.util.UUID.randomUUID().toString())
                    .aggregateId(aggregateId)
                    .exchange(exchange)
                    .routingKey(routingKey)
                    .payloadJson(objectMapper.writeValueAsString(payload))
                    .correlationId(CorrelationIdContext.getOrCreateCorrelationId())
                    .traceparent(CorrelationIdContext.getTraceparent())
                    .status(OutboxStatus.PENDING)
                    .createdAt(Instant.now())
                    .retryCount(0)
                    .build());
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize outbox message", e);
        }
    }

}
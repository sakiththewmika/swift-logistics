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
     * Update order status (called by billing/warehouse/route subscribers)
     */
    @Transactional
    public void updateOrderStatus(String orderId, OrderStatus status) {
        try {
            Optional<Order> orderOpt = orderRepository.findById(orderId);
            if (orderOpt.isEmpty()) {
                throw new RuntimeException("Order not found: " + orderId);
            }

            Order order = orderOpt.get();
            order.setStatus(status);
            order.setUpdatedAt(LocalDateTime.now());
            orderRepository.save(order);

            log.info("Order status updated: orderId={}, status={}", orderId, status);

        } catch (Exception e) {
            log.error("Failed to update order status: orderId={}", orderId, e);
            throw new RuntimeException("Failed to update order status", e);
        }
    }

    @Transactional
    public void updateOrderStatus(String orderId, OrderStatus status, String billingStatus, Double totalAmount) {
        try {
            Optional<Order> orderOpt = orderRepository.findById(orderId);
            if (orderOpt.isEmpty()) {
                throw new RuntimeException("Order not found: " + orderId);
            }

            Order order = orderOpt.get();
            order.setBillingStatus(billingStatus);
            order.setStatus(status);
            order.setTotalAmount(totalAmount);
            order.setUpdatedAt(LocalDateTime.now());
            orderRepository.save(order);

            log.info("Order billing updated: orderId={}, billingStatus={}",
                    orderId, billingStatus);

        } catch (Exception e) {
            log.error("Failed to update order billing: orderId={}", orderId, e);
            throw new RuntimeException("Failed to update order billing", e);
        }
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
    public void processBillingUpdate(com.swiftlogistics.orchestrator.dto.BillingUpdateMessage update) {
        if (!markMessageProcessed(update.getOrderId() + ":BILLING_UPDATE")) return;
        switch (update.getStatus()) {
            case "BILLED" -> {
                updateOrderStatus(update.getOrderId(), OrderStatus.BILLED, "COMPLETED", update.getBilledAmount());
                eventService.logSuccessEvent(update.getOrderId(), EventType.BILLING_COMPLETED,
                        EventSource.CMS_ADAPTER, "Billing completed successfully");
                sendToWarehouse(update.getOrderId());
            }
            case "FAILED" -> {
                updateOrderStatus(update.getOrderId(), OrderStatus.BILLING_FAILED, "FAILED", null);
                eventService.logFailedEvent(update.getOrderId(), EventType.BILLING_FAILED,
                        EventSource.CMS_ADAPTER, "Billing failed");
            }
            case "PENDING" -> eventService.logPendingEvent(update.getOrderId(), EventType.BILLING_PENDING,
                    EventSource.CMS_ADAPTER, "Billing is pending");
            case "CANCELLED_REFUNDED" -> {
                updateOrderStatus(update.getOrderId(), OrderStatus.CANCELLED_REFUNDED, "CANCELLED_REFUNDED", 0D);
                eventService.logSuccessEvent(update.getOrderId(), EventType.ORDER_CANCELLED,
                        EventSource.CMS_ADAPTER, "Billing cancelled and refunded");
            }
            case "BILLING_REFUNDED" -> {
                updateOrderStatus(update.getOrderId(), OrderStatus.CANCELLED_REFUNDED,
                        "CANCELLED_REFUNDED", 0D);
                eventService.logSuccessEvent(update.getOrderId(), EventType.ORDER_CANCELLED,
                        EventSource.CMS_ADAPTER, "Billing compensation completed");
            }
            default -> throw new IllegalArgumentException("Unknown billing status: " + update.getStatus());
        }
    }

    @Transactional
    public void processWarehouseUpdate(com.swiftlogistics.orchestrator.dto.WarehouseUpdateMessage update) {
        if (!markMessageProcessed(update.getOrderId() + ":WAREHOUSE_UPDATE")) return;
        String status = update.getStatus() == null ? "" : update.getStatus().trim().toUpperCase();
        if ("FAILED".equals(status)) {
            updateOrderStatus(update.getOrderId(), OrderStatus.WAREHOUSE_FAILED);
            eventService.logFailedEvent(update.getOrderId(), EventType.WAREHOUSE_FAILED,
                    EventSource.WMS_ADAPTER, "Warehouse processing failed");
            beginBillingCompensation(update.getOrderId(), "Warehouse processing failed");
        } else if ("COMPENSATED".equals(status) || "PACKAGE_RELEASED".equals(status)
                || "WAREHOUSE_COMPENSATED".equals(status)) {
            eventService.logSuccessEvent(update.getOrderId(), EventType.WAREHOUSE_FAILED,
                    EventSource.WMS_ADAPTER, "Warehouse compensation completed");
            beginBillingCompensation(update.getOrderId(), "Warehouse compensation completed");
        } else if ("PROCESSING".equals(status)) {
            updateOrderStatus(update.getOrderId(), OrderStatus.PROCESSING);
            eventService.logPendingEvent(update.getOrderId(), EventType.WAREHOUSE_PROCESSING,
                    EventSource.WMS_ADAPTER, "Warehouse processing in progress");
        } else if ("READY".equals(status)) {
            updateOrderStatus(update.getOrderId(), OrderStatus.READY);
            eventService.logSuccessEvent(update.getOrderId(), EventType.PACKAGE_READY,
                    EventSource.WMS_ADAPTER, "Package is ready for shipment");
            requestRoutePlanning(update.getOrderId());
        } else {
            throw new IllegalArgumentException("Unknown warehouse status: " + update.getStatus());
        }
    }

    @Transactional
    public void beginWarehouseCompensation(String orderId, String reason) {
        updateOrderStatus(orderId, OrderStatus.COMPENSATING_WAREHOUSE);
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

    @Transactional
    public void beginBillingCompensation(String orderId, String reason) {
        updateOrderStatus(orderId, OrderStatus.COMPENSATING_BILLING);
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

    @Transactional
    public void processRouteUpdate(com.swiftlogistics.orchestrator.dto.RouteUpdateMessage update,
                                   RouteService routeService) {
        if (!markMessageProcessed(update.getOrderId() + ":ROUTE_UPDATE")) return;
        String status = update.getStatus() == null ? "" : update.getStatus().trim().toUpperCase();
        if ("ROUTED".equals(status)) {
            routeService.createOrderRoute(update.getOrderId(), update.getWaypoints(),
                    update.getDriverId(), update.getVehicleId());
        } else if ("FAILED".equals(status)) {
            updateOrderStatus(update.getOrderId(), OrderStatus.ROUTE_FAILED);
            eventService.logFailedEvent(update.getOrderId(), EventType.ROUTE_FAILED,
                    EventSource.ROS_ADAPTER, "Route planning failed");
        } else if ("ROUTING".equals(status)) {
            updateOrderStatus(update.getOrderId(), OrderStatus.ROUTING);
            eventService.logPendingEvent(update.getOrderId(), EventType.ROUTE_PENDING,
                    EventSource.ROS_ADAPTER, "Route planning is in progress");
        } else {
            throw new IllegalArgumentException("Unknown route status: " + update.getStatus());
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
package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.dto.DriverUpdateMessage;
import com.swiftlogistics.orchestrator.dto.ProofOfDeliveryRequest;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.Route;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.repository.RouteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DriverService {
    private final OrderRepository orderRepository;
    private final RouteRepository routeRepository;
    private final SsePublisher ssePublisher;
    private final EventService eventService;

    /**
     * Get orders by status and dricer
     */
    public List<Order> getPendingOrdersForDriver(String driverId) {
        return orderRepository.findByStatusInAndDriverId(
                Arrays.asList(OrderStatus.ASSIGNED, OrderStatus.ROUTED, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED), driverId);
    }

    /**
     * Get order details for driver
     */
    public DriverUpdateMessage getOrderDetails(String orderId) {
        Optional<Order> order = orderRepository.findById(orderId);
        if (order.isEmpty()) {
            throw new RuntimeException("Order not found with id: " + orderId);
        }
        Order orderData = order.get();

        Optional<Route> route = routeRepository.findById(orderData.getRouteId());
        if (route.isEmpty()) {
            throw new RuntimeException("Route not found for order: " + orderId);
        }
        Route routeData = route.get();

        // Construct the driver update message
        return DriverUpdateMessage.builder()
                .driverId(orderData.getDriverId())
                .orderId(orderData.getOrderId())
                .status(orderData.getStatus())
                .deliveryAddress(orderData.getDeliveryAddress())
                .city(orderData.getCity())
                .postalCode(orderData.getPostalCode())
                .country(orderData.getCountry())
                .waypoints(routeData.getWaypoints())
                .timestamp(LocalDateTime.now())
                .build();
        }

    /**
     * start delivery for order
     */
    public void startDelivery(String orderId) {
        Optional<Order> orderOpt = orderRepository.findById(orderId);
        if (orderOpt.isEmpty()) {
            throw new RuntimeException("Order not found with id: " + orderId);
        }
        Order order = orderOpt.get();
        order.setStatus(OrderStatus.IN_TRANSIT);
        order.setPickedUpAt(LocalDateTime.now());
        orderRepository.save(order);

        // Publish the status update
        ssePublisher.publishOrderStatusUpdate(orderId, OrderStatus.IN_TRANSIT, "Driver started delivery");

        // Log event
        eventService.logSuccessEvent(orderId, EventType.DELIVERY_STARTED, EventSource.DRIVER_APP,
                "Driver started delivery for order: " + orderId);
    }

    /**
     * complete delivery for order
     */
    public void completeDelivery(String orderId) {
        Optional<Order> orderOpt = orderRepository.findById(orderId);
        if (orderOpt.isEmpty()) {
            throw new RuntimeException("Order not found with id: " + orderId);
        }
        Order order = orderOpt.get();
        order.setStatus(OrderStatus.DELIVERED);
        order.setDeliveredAt(LocalDateTime.now());
        orderRepository.save(order);

        // Publish the status update
        ssePublisher.publishOrderStatusUpdate(orderId, OrderStatus.DELIVERED, "Driver completed delivery");

        // Log event
        eventService.logSuccessEvent(orderId, EventType.DELIVERY_COMPLETED, EventSource.DRIVER_APP,
                "Driver completed delivery for order: " + orderId);
    }

    public void recordProofOfDelivery(String driverId, String orderId, ProofOfDeliveryRequest request) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found with id: " + orderId));
        if (!driverId.equals(order.getDriverId())) {
            throw new IllegalArgumentException("Order is not assigned to this driver");
        }
        if ("DELIVERED".equalsIgnoreCase(request.getStatus())) {
            order.setStatus(OrderStatus.DELIVERED);
            order.setDeliveredAt(LocalDateTime.now());
            order.setProofOfDeliverySignature(request.getSignatureData());
            order.setProofOfDeliveryPhoto(request.getPhotoData());
            eventService.logSuccessEvent(orderId, EventType.DELIVERY_COMPLETED,
                    EventSource.DRIVER_APP, "Delivery completed with proof of delivery");
        } else if ("FAILED".equalsIgnoreCase(request.getStatus())) {
            if (request.getFailureReason() == null || request.getFailureReason().isBlank()) {
                throw new IllegalArgumentException("A failure reason is required");
            }
            order.setStatus(OrderStatus.FAILED);
            order.setDeliveryFailureReason(request.getFailureReason());
            eventService.logFailedEvent(orderId, EventType.DELIVERY_FAILED,
                    EventSource.DRIVER_APP, "Delivery failed: " + request.getFailureReason());
        } else {
            throw new IllegalArgumentException("POD status must be DELIVERED or FAILED");
        }
        order.setDeliveryNotes(request.getNotes());
        orderRepository.save(order);
        ssePublisher.publishOrderStatusUpdate(orderId, order.getStatus(),
                "Driver submitted proof of delivery");
    }
}

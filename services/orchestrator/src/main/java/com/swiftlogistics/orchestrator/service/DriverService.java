package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.dto.DriverUpdateMessage;
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
                Arrays.asList(OrderStatus.ROUTED, OrderStatus.IN_TRANSIT), driverId);
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
}

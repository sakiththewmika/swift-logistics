package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.dto.DriverUpdateMessage;
import com.swiftlogistics.orchestrator.dto.ProofOfDeliveryRequest;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.Route;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.repository.RouteRepository;
import com.swiftlogistics.orchestrator.security.AccessGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DriverService {

    public static final String DRIVER_STATUS_AVAILABLE = "AVAILABLE";
    public static final String DRIVER_STATUS_BUSY = "BUSY";

    /** Orders in these statuses still occupy the driver. */
    private static final Set<OrderStatus> ACTIVE_STATUSES =
            EnumSet.of(OrderStatus.ASSIGNED, OrderStatus.ROUTED, OrderStatus.IN_TRANSIT);
    private static final Set<OrderStatus> STARTABLE = EnumSet.of(OrderStatus.ASSIGNED, OrderStatus.ROUTED, OrderStatus.READY);
    private static final Set<OrderStatus> FINISHABLE = EnumSet.of(OrderStatus.IN_TRANSIT, OrderStatus.ROUTED, OrderStatus.ASSIGNED);
    private final OrderRepository orderRepository;
    private final RouteRepository routeRepository;
    private final DriverRepository driverRepository;
    private final SsePublisher ssePublisher;
    private final EventService eventService;

    /**
     * Get orders by status and dricer
     */
    public List<Order> getPendingOrdersForDriver(String driverId) {
        return orderRepository.findByStatusInAndDriverId(
                Arrays.asList(OrderStatus.ASSIGNED, OrderStatus.ROUTED, OrderStatus.IN_TRANSIT,
                        OrderStatus.DELIVERED, OrderStatus.FAILED), driverId);
    }

    /**
     * Verifies that the authenticated driver is the one the order is assigned to
     * (admins are always allowed; no-op when the request is unauthenticated).
     */
    public void assertDriverOwnsOrder(String orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        AccessGuard.requireOwnerOrAdmin(order.getDriverId());
    }

    /**
     * Get order details for driver
     */
    public DriverUpdateMessage getOrderDetails(String orderId) {
        Order orderData = findOrder(orderId);

        // An order that has not been routed yet simply has no waypoints.
        java.util.List<String> waypoints = Collections.emptyList();
        if (orderData.getRouteId() != null) {
            waypoints = routeRepository.findById(orderData.getRouteId())
                    .map(Route::getWaypoints)
                    .orElse(Collections.emptyList());
        }

        // Construct the driver update message
        return DriverUpdateMessage.builder()
                .driverId(orderData.getDriverId())
                .orderId(orderData.getOrderId())
                .status(orderData.getStatus())
                .deliveryAddress(orderData.getDeliveryAddress())
                .city(orderData.getCity())
                .postalCode(orderData.getPostalCode())
                .country(orderData.getCountry())
                .waypoints(waypoints)
                .timestamp(LocalDateTime.now())
                .build();
    }

    private Order findOrder(String orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found with id: " + orderId));
    }

    private static ResponseStatusException conflict(Order order, String action) {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "Cannot " + action + " an order in status " + order.getStatus());
    }

    /**
     * start delivery for order
     */
    public void startDelivery(String orderId) {
        Order order = findOrder(orderId);
        if (!STARTABLE.contains(order.getStatus())) {
            throw conflict(order, "start delivery for");
        }
        order.setStatus(OrderStatus.IN_TRANSIT);
        order.setPickedUpAt(LocalDateTime.now());
        order.setUpdatedAt(LocalDateTime.now());
        orderRepository.save(order);
        markDriverBusy(order.getDriverId());

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
        Order order = findOrder(orderId);
        if (!FINISHABLE.contains(order.getStatus())) {
            throw conflict(order, "complete delivery for");
        }
        order.setStatus(OrderStatus.DELIVERED);
        order.setDeliveredAt(LocalDateTime.now());
        order.setUpdatedAt(LocalDateTime.now());
        orderRepository.save(order);
        releaseDriverIfIdle(order.getDriverId(), orderId);

        // Publish the status update
        ssePublisher.publishOrderStatusUpdate(orderId, OrderStatus.DELIVERED, "Driver completed delivery");

        // Log event
        eventService.logSuccessEvent(orderId, EventType.DELIVERY_COMPLETED, EventSource.DRIVER_APP,
                "Driver completed delivery for order: " + orderId);
    }

    public void recordProofOfDelivery(String driverId, String orderId, ProofOfDeliveryRequest request) {
        Order order = findOrder(orderId);
        if (!driverId.equals(order.getDriverId())) {
            throw new IllegalArgumentException("Order is not assigned to this driver");
        }
        if (!FINISHABLE.contains(order.getStatus())) {
            // Covers already DELIVERED / FAILED orders: proof is never overwritten.
            throw conflict(order, "submit proof of delivery for");
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
        order.setUpdatedAt(LocalDateTime.now());
        orderRepository.save(order);
        releaseDriverIfIdle(order.getDriverId(), orderId);
        ssePublisher.publishOrderStatusUpdate(orderId, order.getStatus(),
                "Driver submitted proof of delivery");
    }

    private void markDriverBusy(String driverId) {
        if (driverId == null) {
            return;
        }
        driverRepository.findById(driverId).ifPresent(driver -> {
            driver.setAvailable(false);
            driver.setStatus(DRIVER_STATUS_BUSY);
            driverRepository.save(driver);
        });
    }

    /**
     * Frees the driver once the order they just finished was their last active one. A driver
     * who still has other assigned or in-transit orders stays reserved.
     */
    private void releaseDriverIfIdle(String driverId, String finishedOrderId) {
        if (driverId == null) {
            return;
        }
        boolean hasOtherActiveOrders = orderRepository
                .findByStatusInAndDriverId(ACTIVE_STATUSES, driverId).stream()
                .anyMatch(other -> !finishedOrderId.equals(other.getOrderId()));
        if (hasOtherActiveOrders) {
            return;
        }
        driverRepository.findById(driverId).ifPresent(driver -> {
            driver.setAvailable(true);
            driver.setStatus(DRIVER_STATUS_AVAILABLE);
            driverRepository.save(driver);
        });
    }
}

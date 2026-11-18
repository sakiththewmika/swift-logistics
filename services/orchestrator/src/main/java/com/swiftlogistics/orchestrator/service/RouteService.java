package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.model.Driver;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.Route;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.repository.RouteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class RouteService {

  public static final String DRIVER_STATUS_ASSIGNED = "ASSIGNED";

  private final OrderRepository orderRepository;
  private final RouteRepository routeRepository;
  private final DriverRepository driverRepository;
  private final EventService eventService;

  /**
   * Stores the planned route, assigns the driver and moves the order to {@code ROUTED}. The
   * caller ({@code OrderService.processRouteUpdate}) has already checked that the transition is legal.
   * The driver is reserved (not available, status {@code ASSIGNED}); the route planner may still
   * pick a reserved driver as a fallback when every driver is busy, so reservations can stack.
   */
  public Route createOrderRoute(String orderId, List<String> waypoints, String driverId, String vehicleId) {
    try {
      Order order = orderRepository.findById(orderId)
          .orElseThrow(() -> new RuntimeException("Order not found: " + orderId));
      if (!OrderStateMachine.canTransition(order.getStatus(), OrderStatus.ROUTED)) {
        throw new IllegalStateException(
            "Order " + orderId + " cannot be routed from status " + order.getStatus());
      }

      Route route = Route.builder()
          .waypoints(waypoints)
          .createdAt(LocalDateTime.now())
          .build();

      Route newRoute = routeRepository.save(route);
      order.setRouteId(newRoute.getRouteId());
      order.setDriverId(driverId);
      order.setVehicleId(vehicleId);
      order.setStatus(OrderStatus.ROUTED);
      order.setRoutedAt(LocalDateTime.now());
      order.setUpdatedAt(LocalDateTime.now());
      orderRepository.save(order);

      reserveDriver(driverId);

      eventService.logSuccessEvent(
          orderId,
          EventType.ROUTE_CREATED,
          EventSource.ROS_ADAPTER,
          "Route created with driverId: " + driverId
      );

      log.info("Order route updated: orderId={}, driverId={}", orderId, driverId);

      return newRoute;

    } catch (Exception e) {
      log.error("Failed to update order route: orderId={}", orderId, e);
      throw e;
    }
  }

  private void reserveDriver(String driverId) {
    if (driverId == null) {
      return;
    }
    driverRepository.findById(driverId).ifPresentOrElse(driver -> {
      driver.setAvailable(false);
      driver.setStatus(DRIVER_STATUS_ASSIGNED);
      driverRepository.save(driver);
    }, () -> log.warn("Route assigned to unknown driver {}", driverId));
  }
}

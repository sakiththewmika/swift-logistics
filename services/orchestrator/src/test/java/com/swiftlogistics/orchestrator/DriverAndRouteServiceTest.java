package com.swiftlogistics.orchestrator;

import com.swiftlogistics.orchestrator.dto.DriverUpdateMessage;
import com.swiftlogistics.orchestrator.dto.ProofOfDeliveryRequest;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import com.swiftlogistics.orchestrator.model.Driver;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.Route;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.repository.RouteRepository;
import com.swiftlogistics.orchestrator.service.DriverService;
import com.swiftlogistics.orchestrator.service.EventService;
import com.swiftlogistics.orchestrator.service.RouteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class DriverAndRouteServiceTest {

    private OrderRepository orders;
    private RouteRepository routes;
    private DriverRepository drivers;
    private SsePublisher sse;
    private EventService events;
    private DriverService driverService;
    private RouteService routeService;
    private Driver driver;

    @BeforeEach
    void setUp() {
        orders = mock(OrderRepository.class);
        routes = mock(RouteRepository.class);
        drivers = mock(DriverRepository.class);
        sse = mock(SsePublisher.class);
        events = mock(EventService.class);
        driverService = new DriverService(orders, routes, drivers, sse, events);
        routeService = new RouteService(orders, routes, drivers, events);

        driver = Driver.builder().driverId("drv-1").driverName("d1").status("ASSIGNED").isAvailable(false).build();
        when(drivers.findById("drv-1")).thenReturn(Optional.of(driver));
        when(orders.findByStatusInAndDriverId(anyCollection(), anyString())).thenReturn(List.of());
    }

    private Order order(OrderStatus status) {
        Order order = Order.builder().orderId("o-1").customerId("cust-1").driverId("drv-1").status(status).build();
        when(orders.findById("o-1")).thenReturn(Optional.of(order));
        return order;
    }

    private static ProofOfDeliveryRequest pod(String status) {
        ProofOfDeliveryRequest request = new ProofOfDeliveryRequest();
        request.setStatus(status);
        request.setSignatureData("data:image/png;base64,NEW");
        return request;
    }

    // ----- start / complete guards -----

    @Test
    void startDeliveryIsOnlyAllowedBeforeTransit() {
        for (OrderStatus status : List.of(OrderStatus.DELIVERED, OrderStatus.FAILED, OrderStatus.IN_TRANSIT,
                OrderStatus.CANCELLED_REFUNDED, OrderStatus.COMPENSATING_BILLING, OrderStatus.NEW)) {
            order(status);
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> driverService.startDelivery("o-1"), status.name());
            assertEquals(409, ex.getStatusCode().value());
        }
        verify(orders, never()).save(any());
    }

    @Test
    void startDeliveryMovesRoutedOrderInTransitAndMarksDriverBusy() {
        Order order = order(OrderStatus.ROUTED);

        driverService.startDelivery("o-1");

        assertEquals(OrderStatus.IN_TRANSIT, order.getStatus());
        assertNotNull(order.getPickedUpAt());
        assertEquals("BUSY", driver.getStatus());
        assertFalse(driver.isAvailable());
        verify(sse).publishOrderStatusUpdate("o-1", OrderStatus.IN_TRANSIT, "Driver started delivery");
    }

    @Test
    void completeDeliveryRejectsOrdersThatAreNotActive() {
        order(OrderStatus.DELIVERED);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> driverService.completeDelivery("o-1"));
        assertEquals(409, ex.getStatusCode().value());
        verify(orders, never()).save(any());
    }

    @Test
    void completeDeliveryFreesTheDriver() {
        Order order = order(OrderStatus.IN_TRANSIT);

        driverService.completeDelivery("o-1");

        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        assertTrue(driver.isAvailable());
        assertEquals("AVAILABLE", driver.getStatus());
    }

    @Test
    void unknownOrderIsReportedAsNotFound() {
        when(orders.findById("missing")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> driverService.startDelivery("missing"));
        assertEquals(404, ex.getStatusCode().value());
    }

    // ----- proof of delivery -----

    @Test
    void proofOfDeliveryCannotOverwriteAFinishedOrder() {
        Order delivered = order(OrderStatus.DELIVERED);
        delivered.setProofOfDeliverySignature("original-signature");

        assertThrows(ResponseStatusException.class,
                () -> driverService.recordProofOfDelivery("drv-1", "o-1", pod("DELIVERED")));
        assertEquals("original-signature", delivered.getProofOfDeliverySignature());

        Order failed = order(OrderStatus.FAILED);
        assertThrows(ResponseStatusException.class,
                () -> driverService.recordProofOfDelivery("drv-1", "o-1", pod("DELIVERED")));
        assertEquals(OrderStatus.FAILED, failed.getStatus());
        verify(orders, never()).save(any());
    }

    @Test
    void proofOfDeliveryRequiresTheAssignedDriver() {
        order(OrderStatus.IN_TRANSIT);

        assertThrows(IllegalArgumentException.class,
                () -> driverService.recordProofOfDelivery("someone-else", "o-1", pod("DELIVERED")));
    }

    @Test
    void deliveredProofStoresEvidenceAndFreesTheDriver() {
        Order order = order(OrderStatus.IN_TRANSIT);

        driverService.recordProofOfDelivery("drv-1", "o-1", pod("DELIVERED"));

        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        assertEquals("data:image/png;base64,NEW", order.getProofOfDeliverySignature());
        assertTrue(driver.isAvailable());
        assertEquals("AVAILABLE", driver.getStatus());
    }

    @Test
    void failedProofNeedsAReasonAndFreesTheDriver() {
        Order order = order(OrderStatus.IN_TRANSIT);
        assertThrows(IllegalArgumentException.class,
                () -> driverService.recordProofOfDelivery("drv-1", "o-1", pod("FAILED")));
        assertEquals(OrderStatus.IN_TRANSIT, order.getStatus());

        ProofOfDeliveryRequest failure = pod("FAILED");
        failure.setFailureReason("Customer unavailable");
        driverService.recordProofOfDelivery("drv-1", "o-1", failure);

        assertEquals(OrderStatus.FAILED, order.getStatus());
        assertTrue(driver.isAvailable());
    }

    @Test
    void driverStaysReservedWhileTheyHaveOtherActiveOrders() {
        order(OrderStatus.IN_TRANSIT);
        Order other = Order.builder().orderId("o-2").driverId("drv-1").status(OrderStatus.ROUTED).build();
        when(orders.findByStatusInAndDriverId(anyCollection(), anyString())).thenReturn(List.of(other));

        driverService.recordProofOfDelivery("drv-1", "o-1", pod("DELIVERED"));

        assertFalse(driver.isAvailable());
        assertEquals("ASSIGNED", driver.getStatus());
        verify(drivers, never()).save(any());
    }

    // ----- order details -----

    @Test
    void orderDetailsForAnUnroutedOrderHaveNoWaypoints() {
        Order order = order(OrderStatus.READY);
        order.setRouteId(null);

        DriverUpdateMessage details = driverService.getOrderDetails("o-1");

        assertEquals(List.of(), details.getWaypoints());
        verify(routes, never()).findById(any());
    }

    @Test
    void orderDetailsIncludeStoredWaypoints() {
        Order order = order(OrderStatus.ROUTED);
        order.setRouteId("r-1");
        when(routes.findById("r-1")).thenReturn(Optional.of(Route.builder().routeId("r-1")
                .waypoints(List.of("Colombo", "Kandy")).build()));

        assertEquals(List.of("Colombo", "Kandy"), driverService.getOrderDetails("o-1").getWaypoints());
    }

    // ----- RouteService: driver reservation -----

    @Test
    void routingReservesTheAssignedDriver() {
        Order order = order(OrderStatus.READY);
        driver.setAvailable(true);
        driver.setStatus("AVAILABLE");
        when(routes.save(any(Route.class))).thenAnswer(inv -> {
            Route route = inv.getArgument(0);
            route.setRouteId("r-1");
            return route;
        });

        routeService.createOrderRoute("o-1", List.of("Colombo"), "drv-1", "WP CAB-1");

        assertEquals(OrderStatus.ROUTED, order.getStatus());
        assertEquals("r-1", order.getRouteId());
        assertEquals("drv-1", order.getDriverId());
        assertFalse(driver.isAvailable());
        assertEquals("ASSIGNED", driver.getStatus());
        verify(drivers).save(driver);
    }

    @Test
    void routingToAnUnknownDriverStillRoutesTheOrder() {
        Order order = order(OrderStatus.READY);
        when(routes.save(any(Route.class))).thenAnswer(inv -> inv.getArgument(0));

        routeService.createOrderRoute("o-1", List.of("Colombo"), "ghost", "V");

        assertEquals(OrderStatus.ROUTED, order.getStatus());
        verify(drivers, never()).save(any());
    }

    @Test
    void routingAnOrderThatIsNoLongerRoutableChangesNothing() {
        Order order = order(OrderStatus.CANCELLED_REFUNDED);

        assertThrows(IllegalStateException.class,
                () -> routeService.createOrderRoute("o-1", List.of("Colombo"), "drv-1", "V"));

        assertEquals(OrderStatus.CANCELLED_REFUNDED, order.getStatus());
        verify(routes, never()).save(any());
        verify(drivers, never()).save(any());
    }
}

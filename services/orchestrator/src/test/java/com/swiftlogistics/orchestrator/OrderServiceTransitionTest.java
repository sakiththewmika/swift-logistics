package com.swiftlogistics.orchestrator;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftlogistics.orchestrator.config.RabbitMQConfig;
import com.swiftlogistics.orchestrator.dto.BillingUpdateMessage;
import com.swiftlogistics.orchestrator.dto.RouteUpdateMessage;
import com.swiftlogistics.orchestrator.dto.WarehouseUpdateMessage;
import com.swiftlogistics.orchestrator.messaging.publisher.OrderPublisher;
import com.swiftlogistics.orchestrator.messaging.publisher.SsePublisher;
import com.swiftlogistics.orchestrator.messaging.subscriber.BillingUpdateSubscriber;
import com.swiftlogistics.orchestrator.messaging.subscriber.RouteSubscriber;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.OutboxEvent;
import com.swiftlogistics.orchestrator.model.ProcessedMessage;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.repository.CustomerRepository;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.repository.OutboxRepository;
import com.swiftlogistics.orchestrator.repository.ProcessedMessageRepository;
import com.swiftlogistics.orchestrator.service.EventService;
import com.swiftlogistics.orchestrator.service.OrderService;
import com.swiftlogistics.orchestrator.service.RouteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** OrderService against in-memory repositories: guarded transitions and atomic compensation. */
class OrderServiceTransitionTest {

    private final Map<String, Order> orders = new HashMap<>();
    private final List<OutboxEvent> outbox = new ArrayList<>();
    private final Set<String> processed = new HashSet<>();
    private EventService events;
    private RouteService routeService;
    private OrderService service;

    @BeforeEach
    void setUp() {
        OrderRepository orderRepository = mock(OrderRepository.class);
        when(orderRepository.findById(anyString()))
                .thenAnswer(inv -> Optional.ofNullable(orders.get(inv.<String>getArgument(0))));
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order saved = inv.getArgument(0);
            orders.put(saved.getOrderId(), saved);
            return saved;
        });

        OutboxRepository outboxRepository = mock(OutboxRepository.class);
        when(outboxRepository.save(any(OutboxEvent.class))).thenAnswer(inv -> {
            OutboxEvent event = inv.getArgument(0);
            outbox.add(event);
            return event;
        });

        ProcessedMessageRepository processedRepository = mock(ProcessedMessageRepository.class);
        when(processedRepository.insert(any(ProcessedMessage.class))).thenAnswer(inv -> {
            ProcessedMessage message = inv.getArgument(0);
            if (!processed.add(message.getMessageId())) {
                throw new DuplicateKeyException("duplicate " + message.getMessageId());
            }
            return message;
        });

        events = mock(EventService.class);
        routeService = mock(RouteService.class);
        service = new OrderService(orderRepository, mock(CustomerRepository.class), outboxRepository,
                mock(OrderPublisher.class), events, new ObjectMapper().findAndRegisterModules(), processedRepository);
    }

    private Order order(OrderStatus status) {
        Order order = Order.builder().orderId("o-1").customerId("cust-1").status(status)
                .totalAmount(18500D).deliveryAddress("42 Galle Road").city("Colombo").build();
        orders.put("o-1", order);
        return order;
    }

    private static BillingUpdateMessage billing(String status, Double amount) {
        return BillingUpdateMessage.builder().orderId("o-1").status(status).billedAmount(amount).build();
    }

    private static WarehouseUpdateMessage warehouse(String status) {
        return WarehouseUpdateMessage.builder().orderId("o-1").status(status).build();
    }

    private static RouteUpdateMessage route(String status) {
        return RouteUpdateMessage.builder().orderId("o-1").status(status)
                .driverId("drv-1").vehicleId("WP CAB-1").waypoints(List.of("Colombo", "Kandy")).build();
    }

    // ----- forward flow -----

    @Test
    void billedStampsBilledAtAndQueuesTheWarehouseRequest() {
        order(OrderStatus.NEW);

        Optional<OrderStatus> result = service.processBillingUpdate(billing("BILLED", 18500D));

        assertEquals(Optional.of(OrderStatus.BILLED), result);
        assertNotNull(orders.get("o-1").getBilledAt());
        assertEquals("COMPLETED", orders.get("o-1").getBillingStatus());
        assertEquals(1, outbox.size());
        assertEquals(RabbitMQConfig.ROUTING_KEY_WAREHOUSE_REQUEST, outbox.get(0).getRoutingKey());
    }

    @Test
    void warehouseReadyStampsPackageReadyAtAndRequestsRoutePlanning() {
        order(OrderStatus.PROCESSING);

        Optional<OrderStatus> result = service.processWarehouseUpdate(warehouse("READY"));

        assertEquals(Optional.of(OrderStatus.READY), result);
        assertNotNull(orders.get("o-1").getPackageReadyAt());
        assertEquals(RabbitMQConfig.ROUTING_KEY_ROUTE_PLANNING, outbox.get(0).getRoutingKey());
    }

    @Test
    void duplicateMessagesDoNothingTheSecondTime() {
        order(OrderStatus.NEW);
        assertTrue(service.processBillingUpdate(billing("BILLED", 18500D)).isPresent());
        outbox.clear();

        assertTrue(service.processBillingUpdate(billing("BILLED", 18500D)).isEmpty());
        assertTrue(outbox.isEmpty());
    }

    // ----- out-of-order events -----

    @Test
    void lateProcessingAfterReadyIsIgnored() {
        order(OrderStatus.READY);

        assertTrue(service.processWarehouseUpdate(warehouse("PROCESSING")).isEmpty());

        assertEquals(OrderStatus.READY, orders.get("o-1").getStatus());
        verify(events, never()).logPendingEvent(anyString(), any(), any(), anyString());
    }

    @Test
    void lateProcessingAfterRoutedIsIgnored() {
        order(OrderStatus.ROUTED);

        assertTrue(service.processWarehouseUpdate(warehouse("PROCESSING")).isEmpty());
        assertEquals(OrderStatus.ROUTED, orders.get("o-1").getStatus());
    }

    @Test
    void lateRoutingAfterRoutedIsIgnored() {
        order(OrderStatus.ROUTED);

        assertTrue(service.processRouteUpdate(route("ROUTING"), routeService).isEmpty());
        assertEquals(OrderStatus.ROUTED, orders.get("o-1").getStatus());
    }

    @Test
    void routedAfterCompensationOrTerminalStateCannotResurrectTheOrder() {
        for (OrderStatus status : List.of(OrderStatus.COMPENSATING_WAREHOUSE, OrderStatus.COMPENSATING_BILLING,
                OrderStatus.CANCELLED_REFUNDED, OrderStatus.DELIVERED, OrderStatus.FAILED)) {
            order(status);
            processed.clear();

            assertTrue(service.processRouteUpdate(route("ROUTED"), routeService).isEmpty(), status.name());
            assertEquals(status, orders.get("o-1").getStatus());
        }
        verify(routeService, never()).createOrderRoute(any(), any(), any(), any());
    }

    @Test
    void routingAfterCompensationStartedIsIgnored() {
        order(OrderStatus.COMPENSATING_BILLING);

        assertTrue(service.processRouteUpdate(route("ROUTING"), routeService).isEmpty());
        assertEquals(OrderStatus.COMPENSATING_BILLING, orders.get("o-1").getStatus());
    }

    @Test
    void warehouseReleaseAckIsIgnoredUnlessReleaseWasRequested() {
        order(OrderStatus.READY);

        assertTrue(service.processWarehouseUpdate(warehouse("PACKAGE_RELEASED")).isEmpty());

        assertEquals(OrderStatus.READY, orders.get("o-1").getStatus());
        assertTrue(outbox.isEmpty());
    }

    // ----- amounts -----

    @Test
    void billingFailureKeepsTheOriginalAmount() {
        order(OrderStatus.NEW);

        assertEquals(Optional.of(OrderStatus.BILLING_FAILED), service.processBillingUpdate(billing("FAILED", null)));

        Order saved = orders.get("o-1");
        assertEquals(18500D, saved.getTotalAmount());
        assertEquals("FAILED", saved.getBillingStatus());
    }

    @Test
    void refundKeepsTheOriginalAmount() {
        order(OrderStatus.COMPENSATING_BILLING);

        assertEquals(Optional.of(OrderStatus.CANCELLED_REFUNDED),
                service.processBillingUpdate(billing("BILLING_REFUNDED", 0D)));

        Order saved = orders.get("o-1");
        assertEquals(18500D, saved.getTotalAmount());
        assertEquals("CANCELLED_REFUNDED", saved.getBillingStatus());
    }

    // ----- compensation -----

    @Test
    void warehouseFailureStartsBillingCompensation() {
        order(OrderStatus.BILLED);

        Optional<OrderStatus> result = service.processWarehouseUpdate(warehouse("FAILED"));

        assertEquals(Optional.of(OrderStatus.COMPENSATING_BILLING), result);
        assertEquals(OrderStatus.COMPENSATING_BILLING, orders.get("o-1").getStatus());
        assertEquals(RabbitMQConfig.ROUTING_KEY_BILLING_COMPENSATION, outbox.get(0).getRoutingKey());
    }

    @Test
    void routeFailureIsCompensatedInTheSameTransactionalMethod() throws Exception {
        order(OrderStatus.READY);

        Optional<OrderStatus> result = service.processRouteUpdate(route("FAILED"), routeService);

        // ROUTE_FAILED is recorded, the order moves to COMPENSATING_WAREHOUSE and the release is queued
        // by this one call; nothing is left for the subscriber to do afterwards.
        assertEquals(Optional.of(OrderStatus.COMPENSATING_WAREHOUSE), result);
        assertEquals(OrderStatus.COMPENSATING_WAREHOUSE, orders.get("o-1").getStatus());
        verify(events).logFailedEvent("o-1", EventType.ROUTE_FAILED,
                EventSource.ROS_ADAPTER, "Route planning failed");
        assertEquals(1, outbox.size());
        assertEquals(RabbitMQConfig.ROUTING_KEY_WAREHOUSE_COMPENSATION, outbox.get(0).getRoutingKey());
        assertTrue(outbox.get(0).getPayloadJson().contains("Route planning failed"));

        assertNotNull(OrderService.class.getMethod("processRouteUpdate", RouteUpdateMessage.class, RouteService.class)
                .getAnnotation(Transactional.class), "route handling must run in one transaction");
    }

    @Test
    void routeFailureTwiceOnlyCompensatesOnce() {
        order(OrderStatus.READY);
        service.processRouteUpdate(route("FAILED"), routeService);

        assertTrue(service.processRouteUpdate(route("FAILED"), routeService).isEmpty());
        assertEquals(1, outbox.size());
    }

    @Test
    void unknownStatusesAreRejectedForDeadLettering() {
        order(OrderStatus.NEW);

        assertThrows(IllegalArgumentException.class, () -> service.processBillingUpdate(billing("WHATEVER", null)));
        assertThrows(IllegalArgumentException.class, () -> service.processBillingUpdate(billing(null, null)));
    }

    // ----- subscribers -----

    @Test
    void routeSubscriberNoLongerStartsCompensationItselfAndNotifiesOnce() {
        OrderService orderService = mock(OrderService.class);
        SsePublisher sse = mock(SsePublisher.class);
        RouteSubscriber subscriber = new RouteSubscriber(orderService, routeService, events, sse,
                mock(SimpMessagingTemplate.class));
        RouteUpdateMessage failed = route("FAILED");
        when(orderService.processRouteUpdate(failed, routeService))
                .thenReturn(Optional.of(OrderStatus.COMPENSATING_WAREHOUSE));

        try {
            subscriber.processRouteUpdate(failed, null, null);
        } catch (Exception e) {
            fail(e);
        }

        verify(orderService, never()).beginWarehouseCompensation(any(), any());
        verify(sse).publishOrderStatusUpdate(eq("o-1"), eq(OrderStatus.ROUTE_FAILED), anyString());
        verify(sse).publishOrderStatusUpdate(eq("o-1"), eq(OrderStatus.COMPENSATING_WAREHOUSE), anyString());
    }

    @Test
    void subscribersStaySilentWhenNoTransitionHappened() throws Exception {
        OrderService orderService = mock(OrderService.class);
        SsePublisher sse = mock(SsePublisher.class);
        when(orderService.processBillingUpdate(any())).thenReturn(Optional.empty());
        when(orderService.processRouteUpdate(any(), any())).thenReturn(Optional.empty());

        new BillingUpdateSubscriber(orderService, events, sse).handleBillingUpdate(billing("BILLED", 1D), null, null);
        new RouteSubscriber(orderService, routeService, events, sse, mock(SimpMessagingTemplate.class))
                .processRouteUpdate(route("ROUTED"), null, null);

        verifyNoInteractions(sse);
    }
}

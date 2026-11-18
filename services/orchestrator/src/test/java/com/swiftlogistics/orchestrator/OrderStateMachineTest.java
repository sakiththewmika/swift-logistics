package com.swiftlogistics.orchestrator;

import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.service.OrderStateMachine;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.swiftlogistics.orchestrator.model.enums.OrderStatus.*;
import static org.junit.jupiter.api.Assertions.*;

class OrderStateMachineTest {

    private static final List<OrderStatus> TERMINAL =
            List.of(BILLING_FAILED, DELIVERED, FAILED, CANCELLED, CANCELLED_REFUNDED);

    @Test
    void happyPathIsAllowedStepByStep() {
        List<OrderStatus> path = List.of(NEW, BILLED, PROCESSING, READY, ROUTING, ROUTED, IN_TRANSIT, DELIVERED);
        for (int i = 0; i < path.size() - 1; i++) {
            assertTrue(OrderStateMachine.canTransition(path.get(i), path.get(i + 1)),
                    path.get(i) + " -> " + path.get(i + 1));
        }
    }

    @Test
    void stagesMayBeSkippedWhenAnAdapterDoesNotReportThem() {
        assertTrue(OrderStateMachine.canTransition(BILLED, READY));
        assertTrue(OrderStateMachine.canTransition(READY, ROUTED));
    }

    @Test
    void compensationChainsAreAllowed() {
        assertTrue(OrderStateMachine.canTransition(BILLED, WAREHOUSE_FAILED));
        assertTrue(OrderStateMachine.canTransition(WAREHOUSE_FAILED, COMPENSATING_BILLING));
        assertTrue(OrderStateMachine.canTransition(READY, ROUTE_FAILED));
        assertTrue(OrderStateMachine.canTransition(ROUTE_FAILED, COMPENSATING_WAREHOUSE));
        assertTrue(OrderStateMachine.canTransition(COMPENSATING_WAREHOUSE, COMPENSATING_BILLING));
        assertTrue(OrderStateMachine.canTransition(COMPENSATING_BILLING, CANCELLED_REFUNDED));
    }

    @Test
    void regressionsAreRejected() {
        assertFalse(OrderStateMachine.canTransition(READY, PROCESSING));
        assertFalse(OrderStateMachine.canTransition(ROUTED, PROCESSING));
        assertFalse(OrderStateMachine.canTransition(ROUTED, ROUTING));
        assertFalse(OrderStateMachine.canTransition(IN_TRANSIT, ROUTED));
        assertFalse(OrderStateMachine.canTransition(BILLED, NEW));
    }

    @Test
    void routingAndRoutedAreRejectedOnceCompensationHasStarted() {
        for (OrderStatus compensating : List.of(ROUTE_FAILED, COMPENSATING_WAREHOUSE, COMPENSATING_BILLING)) {
            assertFalse(OrderStateMachine.canTransition(compensating, ROUTING), compensating + " -> ROUTING");
            assertFalse(OrderStateMachine.canTransition(compensating, ROUTED), compensating + " -> ROUTED");
        }
    }

    @Test
    void terminalOrdersNeverChange() {
        for (OrderStatus terminal : TERMINAL) {
            assertTrue(OrderStateMachine.isTerminal(terminal), terminal.name());
            for (OrderStatus target : OrderStatus.values()) {
                assertFalse(OrderStateMachine.canTransition(terminal, target), terminal + " -> " + target);
            }
        }
    }

    @Test
    void repeatingTheCurrentStatusIsNotATransition() {
        for (OrderStatus status : OrderStatus.values()) {
            assertFalse(OrderStateMachine.canTransition(status, status), status.name());
        }
    }

    @Test
    void ordersWithoutAStatusAreTreatedAsNew() {
        assertTrue(OrderStateMachine.canTransition(null, BILLED));
        assertFalse(OrderStateMachine.isTerminal(null));
    }
}

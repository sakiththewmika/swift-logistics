package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.model.enums.OrderStatus;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static com.swiftlogistics.orchestrator.model.enums.OrderStatus.*;

/**
 * The single definition of which order status changes are legal.
 *
 * <p>Forward flow:
 * {@code NEW -> BILLED -> (PROCESSING) -> READY -> (ROUTING) -> ROUTED -> (ASSIGNED) -> IN_TRANSIT -> DELIVERED|FAILED}.
 * Compensation flows:
 * <ul>
 *   <li>warehouse failure: {@code WAREHOUSE_FAILED -> COMPENSATING_BILLING -> CANCELLED_REFUNDED}</li>
 *   <li>route failure: {@code ROUTE_FAILED -> COMPENSATING_WAREHOUSE -> COMPENSATING_BILLING -> CANCELLED_REFUNDED}</li>
 * </ul>
 * Anything not listed (a late {@code PROCESSING} after {@code READY}, a {@code ROUTED} after
 * a refund, any change to a terminal order, ...) is an out-of-order event and must be ignored.
 */
public final class OrderStateMachine {

    private static final Map<OrderStatus, Set<OrderStatus>> ALLOWED = new EnumMap<>(OrderStatus.class);

    private static final Set<OrderStatus> TERMINAL =
            EnumSet.of(BILLING_FAILED, DELIVERED, FAILED, CANCELLED, CANCELLED_REFUNDED);

    static {
        allow(NEW, BILLING_PENDING, BILLED, BILLING_FAILED);
        allow(BILLING_PENDING, BILLED, BILLING_FAILED);
        allow(BILLED, PROCESSING, READY, WAREHOUSE_FAILED);
        allow(PROCESSING, READY, WAREHOUSE_FAILED);
        allow(READY, ROUTING, ROUTED, ROUTE_FAILED);
        allow(ROUTING, ROUTED, ROUTE_FAILED);
        allow(ROUTED, ASSIGNED, IN_TRANSIT, DELIVERED, FAILED);
        allow(ASSIGNED, IN_TRANSIT, DELIVERED, FAILED);
        allow(IN_TRANSIT, DELIVERED, FAILED);
        allow(WAREHOUSE_FAILED, COMPENSATING_BILLING);
        allow(ROUTE_FAILED, COMPENSATING_WAREHOUSE);
        allow(COMPENSATING_WAREHOUSE, COMPENSATING_BILLING);
        allow(COMPENSATING_BILLING, CANCELLED_REFUNDED);
    }

    private OrderStateMachine() {
    }

    private static void allow(OrderStatus from, OrderStatus... to) {
        ALLOWED.put(from, EnumSet.of(to[0], to));
    }

    /** Legacy documents without a status are treated as freshly created. */
    private static OrderStatus normalize(OrderStatus status) {
        return status == null ? NEW : status;
    }

    public static boolean canTransition(OrderStatus from, OrderStatus to) {
        return ALLOWED.getOrDefault(normalize(from), Set.of()).contains(to);
    }

    public static boolean isTerminal(OrderStatus status) {
        return TERMINAL.contains(normalize(status));
    }
}

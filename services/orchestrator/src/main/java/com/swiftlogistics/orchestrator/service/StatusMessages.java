package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.model.enums.OrderStatus;

/** Human-readable text pushed to clients when an order enters a status. */
public final class StatusMessages {

    private StatusMessages() {
    }

    public static String describe(OrderStatus status) {
        return switch (status) {
            case NEW -> "Order created";
            case BILLING_PENDING -> "Billing is pending";
            case BILLED -> "Billing completed successfully";
            case BILLING_FAILED -> "Billing failed";
            case PROCESSING -> "Warehouse processing in progress";
            case READY -> "Package is ready for shipment";
            case WAREHOUSE_FAILED -> "Warehouse processing failed";
            case ROUTING -> "Route planning is in progress";
            case ROUTED -> "Route created successfully";
            case ROUTE_FAILED -> "Route planning failed";
            case ASSIGNED -> "Driver assigned";
            case IN_TRANSIT -> "Driver started delivery";
            case DELIVERED -> "Order delivered";
            case FAILED -> "Delivery failed";
            case CANCELLED -> "Order cancelled";
            case CANCELLED_REFUNDED -> "Order cancelled and billing refunded";
            case COMPENSATING_WAREHOUSE -> "Route failed; warehouse compensation started";
            case COMPENSATING_BILLING -> "Billing compensation started";
        };
    }
}

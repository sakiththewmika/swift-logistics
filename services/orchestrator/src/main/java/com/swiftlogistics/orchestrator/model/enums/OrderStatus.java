package com.swiftlogistics.orchestrator.model.enums;

public enum OrderStatus {
    NEW,           // Order created
    BILLED,        // CMS billing completed
    BILLING_FAILED,// CMS billing failed
    BILLING_PENDING,// CMS billing pending
    PROCESSING,     // WMS packaging in progress
    READY,         // WMS package ready
    WAREHOUSE_FAILED,// WMS packaging failed
    ROUTED,        // ROS route planned
    ROUTING,       // ROS route planning in progress
    ROUTE_FAILED,
    ASSIGNED,      // Driver assigned
    IN_TRANSIT,    // Package in transit
    DELIVERED,     // Delivery completed
    CANCELLED,     // Order cancelled
    CANCELLED_REFUNDED,
    FAILED         // Order failed
}

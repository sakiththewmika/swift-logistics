package com.swiftlogistics.orchestrator.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class RouteUpdateMessage {
    private String messageId;
    private String orderId;
    private String status; // "ROUTED", "FAILED", "OPTIMIZING"
    private List<String> waypoints;
    private String driverId;
    private String vehicleId;
    private LocalDateTime timestamp;
}
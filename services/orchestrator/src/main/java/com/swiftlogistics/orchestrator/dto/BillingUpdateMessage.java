package com.swiftlogistics.orchestrator.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class BillingUpdateMessage {
    private String messageId;
    private String orderId;
    private String status; // "BILLED", "FAILED", "PENDING"
    private Double billedAmount;
    private LocalDateTime timestamp;
}
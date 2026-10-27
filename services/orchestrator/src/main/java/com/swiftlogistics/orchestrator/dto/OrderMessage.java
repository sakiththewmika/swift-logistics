package com.swiftlogistics.orchestrator.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class OrderMessage {
    @Id
    private String orderId;
    private String customerId;
    private String customerName;
    private String customerEmail;
    private String deliveryAddress;
    private String city;
    private String postalCode;
    private String country;
    private Double totalAmount;
    private LocalDateTime timestamp;

    public String getMessageId() {
        return orderId;
    }
}


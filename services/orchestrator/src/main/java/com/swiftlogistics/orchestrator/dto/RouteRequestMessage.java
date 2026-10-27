package com.swiftlogistics.orchestrator.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class RouteRequestMessage {
    private String messageId;
    private String orderId;
    private String deliveryAddress;
    private String city;
    private String postalCode;
    private String country;
}

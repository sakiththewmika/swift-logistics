package com.swiftlogistics.orchestrator.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateOrderRequest {
    @NotBlank(message = "customerId is required")
    @Size(max = 64, message = "customerId must be at most 64 characters")
    private String customerId;

    // Delivery Address
    @NotBlank(message = "deliveryAddress is required")
    @Size(max = 500, message = "deliveryAddress must be at most 500 characters")
    private String deliveryAddress;

    @Size(max = 100, message = "city must be at most 100 characters")
    private String city;

    @Size(max = 20, message = "postalCode must be at most 20 characters")
    private String postalCode;

    @Size(max = 100, message = "country must be at most 100 characters")
    private String country;

    // Billing Information
    @NotNull(message = "totalAmount is required")
    @Positive(message = "totalAmount must be greater than 0")
    @DecimalMax(value = "100000000", message = "totalAmount must not exceed 100,000,000")
    private Double totalAmount;
}

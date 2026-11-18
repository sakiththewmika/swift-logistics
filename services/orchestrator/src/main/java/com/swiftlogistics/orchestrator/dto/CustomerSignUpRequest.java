package com.swiftlogistics.orchestrator.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Whitelisted sign-up payload for customers. Identifiers, tokens and timestamps are
 * never accepted from the client.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CustomerSignUpRequest {

    @NotBlank(message = "Customer name is required")
    @Size(max = 100, message = "Customer name must be at most 100 characters")
    private String customerName;

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be a valid address")
    @Size(max = 254, message = "Email must be at most 254 characters")
    private String customerEmail;

    @NotBlank(message = "Password is required")
    @Size(min = 6, max = 72, message = "Password must be between 6 and 72 characters")
    private String password;

    @Size(max = 32, message = "Phone must be at most 32 characters")
    private String phone;
}

package com.swiftlogistics.orchestrator.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Whitelisted sign-up payload for drivers. Identifiers, availability, tokens and status
 * are never accepted from the client.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DriverSignUpRequest {

    @NotBlank(message = "Driver name is required")
    @Size(max = 100, message = "Driver name must be at most 100 characters")
    private String driverName;

    @Email(message = "Email must be a valid address")
    @Size(max = 254, message = "Email must be at most 254 characters")
    private String driverEmail;

    @Size(max = 100, message = "Name must be at most 100 characters")
    private String name;

    @NotBlank(message = "Password is required")
    @Size(min = 6, max = 72, message = "Password must be between 6 and 72 characters")
    private String password;

    @NotBlank(message = "Vehicle is required")
    @Size(max = 50, message = "Vehicle must be at most 50 characters")
    private String vehicleId;

    @Size(max = 50, message = "Vehicle type must be at most 50 characters")
    private String type;
}

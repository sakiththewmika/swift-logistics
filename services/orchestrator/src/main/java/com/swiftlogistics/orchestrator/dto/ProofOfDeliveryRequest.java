package com.swiftlogistics.orchestrator.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ProofOfDeliveryRequest {
    /** Maximum length of an embedded base64 image (signature or photo). */
    public static final int MAX_IMAGE_LENGTH = 2_000_000;

    @NotBlank(message = "status is required")
    @Pattern(regexp = "(?i)DELIVERED|FAILED", message = "status must be DELIVERED or FAILED")
    private String status;

    @Size(max = MAX_IMAGE_LENGTH, message = "signatureData is too large")
    private String signatureData;

    @Size(max = MAX_IMAGE_LENGTH, message = "photoData is too large")
    private String photoData;

    @Size(max = 2000, message = "notes must be at most 2000 characters")
    private String notes;

    @Size(max = 500, message = "failureReason must be at most 500 characters")
    private String failureReason;
}

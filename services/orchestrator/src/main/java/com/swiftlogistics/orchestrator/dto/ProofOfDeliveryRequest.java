package com.swiftlogistics.orchestrator.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ProofOfDeliveryRequest {
    @NotBlank
    private String status;
    private String signatureData;
    private String photoData;
    private String notes;
    private String failureReason;
}

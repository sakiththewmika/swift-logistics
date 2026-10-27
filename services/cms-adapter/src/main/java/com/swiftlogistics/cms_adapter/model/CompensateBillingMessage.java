package com.swiftlogistics.cms_adapter.model;

import lombok.Data;

@Data
public class CompensateBillingMessage {
    private String messageId;
    private String orderId;
    private String reason;
}

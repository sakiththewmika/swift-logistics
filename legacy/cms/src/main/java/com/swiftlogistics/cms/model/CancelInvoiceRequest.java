package com.swiftlogistics.cms.model;

import jakarta.xml.bind.annotation.*;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
@XmlAccessorType(XmlAccessType.FIELD)
@XmlRootElement(name = "CancelInvoiceRequest", namespace = "http://swiftlogistics.com/cms/orders")
public class CancelInvoiceRequest {
    @XmlElement(namespace = "http://swiftlogistics.com/cms/orders", required = true)
    private String orderId;
}

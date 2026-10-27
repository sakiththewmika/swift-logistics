package com.swiftlogistics.cms.model;

import jakarta.xml.bind.annotation.*;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
@XmlAccessorType(XmlAccessType.FIELD)
@XmlRootElement(name = "CancelInvoiceResponse", namespace = "http://swiftlogistics.com/cms/orders")
public class CancelInvoiceResponse {
    @XmlElement(namespace = "http://swiftlogistics.com/cms/orders", required = true)
    private String status;
    @XmlElement(namespace = "http://swiftlogistics.com/cms/orders", required = true)
    private String message;
    @XmlElement(namespace = "http://swiftlogistics.com/cms/orders", required = true)
    private String orderId;
}

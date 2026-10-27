package com.swiftlogistics.cms.model;

import jakarta.xml.bind.annotation.XmlAccessType;
import jakarta.xml.bind.annotation.XmlAccessorType;
import jakarta.xml.bind.annotation.XmlElement;
import jakarta.xml.bind.annotation.XmlRootElement;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@XmlAccessorType(XmlAccessType.FIELD)
@XmlRootElement(name = "CancelOrderBillingResponse", namespace = "http://swiftlogistics.com/cms/orders")
public class CancelOrderBillingResponse {
    @XmlElement(namespace = "http://swiftlogistics.com/cms/orders", required = true)
    private String status;
    @XmlElement(namespace = "http://swiftlogistics.com/cms/orders", required = true)
    private String message;
    @XmlElement(namespace = "http://swiftlogistics.com/cms/orders", required = true)
    private String orderId;
}

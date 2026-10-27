package com.swiftlogistics.cms_adapter.soap;

import java.math.BigDecimal;

import com.swiftlogistics.cms_adapter.wsdl.SubmitOrderRequest;
import com.swiftlogistics.cms_adapter.wsdl.SubmitOrderResponse;
import com.swiftlogistics.cms_adapter.wsdl.CancelInvoiceRequest;
import com.swiftlogistics.cms_adapter.wsdl.CancelInvoiceResponse;
import com.swiftlogistics.cms_adapter.wsdl.CancelOrderBillingRequest;
import com.swiftlogistics.cms_adapter.wsdl.CancelOrderBillingResponse;
import org.springframework.ws.client.core.support.WebServiceGatewaySupport;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class CmsSoapClient extends WebServiceGatewaySupport {

    public SubmitOrderResponse submitOrder(String orderId, String clientId, Double amount) {
        SubmitOrderRequest request = new SubmitOrderRequest();
        request.setOrderId(orderId);
        request.setClientId(clientId);
        request.setAmount(amount);

        log.info("➡️ Sending SOAP request to CMS: {}", orderId);

        SubmitOrderResponse response = (SubmitOrderResponse) getWebServiceTemplate()
                .marshalSendAndReceive(request);

        log.info("⬅️ Received SOAP response from CMS: {}", response.getStatus());

        return response;
    }

    public CancelInvoiceResponse cancelInvoice(String orderId) {
        CancelInvoiceRequest request = new CancelInvoiceRequest();
        request.setOrderId(orderId);
        return (CancelInvoiceResponse) getWebServiceTemplate().marshalSendAndReceive(request);
    }

    public CancelOrderBillingResponse cancelOrderBilling(String orderId) {
        CancelOrderBillingRequest request = new CancelOrderBillingRequest();
        request.setOrderId(orderId);
        return (CancelOrderBillingResponse) getWebServiceTemplate().marshalSendAndReceive(request);
    }
}
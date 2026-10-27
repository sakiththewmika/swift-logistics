package com.swiftlogistics.cms.endpoint;

import org.springframework.ws.server.endpoint.annotation.Endpoint;
import org.springframework.ws.server.endpoint.annotation.PayloadRoot;
import org.springframework.ws.server.endpoint.annotation.RequestPayload;
import org.springframework.ws.server.endpoint.annotation.ResponsePayload;

import com.swiftlogistics.cms.model.Order;
import com.swiftlogistics.cms.model.SubmitOrderRequest;
import com.swiftlogistics.cms.model.SubmitOrderResponse;
import com.swiftlogistics.cms.model.CancelInvoiceRequest;
import com.swiftlogistics.cms.model.CancelInvoiceResponse;
import com.swiftlogistics.cms.service.OrderService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Endpoint
@RequiredArgsConstructor
@Slf4j
public class OrderEndpoint {

    private static final String NAMESPACE_URI = "http://swiftlogistics.com/cms/orders";
    private final OrderService orderService;

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "SubmitOrderRequest")
    @ResponsePayload
    public SubmitOrderResponse submitOrder(@RequestPayload SubmitOrderRequest request) {
        log.info("Mock CMS - Received SubmitOrderRequest: {}", request);
        Order order = orderService.saveOrder(
                request.getOrderId(),
                request.getClientId(),
                request.getAmount()
        );

        // Mock CMS - always return success/completed status
        SubmitOrderResponse response = new SubmitOrderResponse();
        response.setStatus("BILLED");
        response.setMessage("Order " + order.getOrderId() + " successfully processed and billed by CMS mock");
        response.setOrderId(order.getOrderId());
        response.setBilledAmount(order.getTotalAmount());
        log.info("Mock CMS - Returning SubmitOrderResponse: {}", response);
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "CancelInvoiceRequest")
    @ResponsePayload
    public CancelInvoiceResponse cancelInvoice(@RequestPayload CancelInvoiceRequest request) {
        CancelInvoiceResponse response = new CancelInvoiceResponse();
        response.setStatus("CANCELLED_REFUNDED");
        response.setOrderId(request.getOrderId());
        response.setMessage("Invoice cancelled and refunded");
        return response;
    }
}

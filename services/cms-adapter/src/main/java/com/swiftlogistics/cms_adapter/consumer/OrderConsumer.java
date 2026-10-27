package com.swiftlogistics.cms_adapter.consumer;

import com.swiftlogistics.cms_adapter.model.BillingUpdateMessage;
import com.swiftlogistics.cms_adapter.wsdl.SubmitOrderResponse;
import com.swiftlogistics.cms_adapter.wsdl.CancelInvoiceResponse;
import com.swiftlogistics.cms_adapter.wsdl.CancelOrderBillingResponse;
import com.swiftlogistics.cms_adapter.model.CompensateBillingMessage;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

import com.swiftlogistics.cms_adapter.config.RabbitMQConfig;
import com.swiftlogistics.cms_adapter.model.OrderMessage;
import com.swiftlogistics.cms_adapter.producer.BillingUpdatePublisher;
import com.swiftlogistics.cms_adapter.soap.CmsSoapClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.ws.client.WebServiceIOException;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderConsumer {

    private final CmsSoapClient cmsSoapClient;
    private final BillingUpdatePublisher billingUpdatePublisher;

    @RabbitListener(queues = RabbitMQConfig.QUEUE_ORDER_CREATED)
    @Retryable(
            retryFor = {WebServiceIOException.class},
            maxAttempts = 4,
            backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void consumeOrder(OrderMessage orderMessage) {
        log.info(" Received Order from Orchestrator: {}", orderMessage);

        // Call CMS SOAP service
        SubmitOrderResponse response = cmsSoapClient.submitOrder(
                orderMessage.getOrderId(),
                orderMessage.getCustomerId(),
                orderMessage.getTotalAmount()
        );

        //Create Billing update message
        BillingUpdateMessage message = BillingUpdateMessage.builder()
                .orderId(response.getOrderId())
                .status(response.getStatus())
                .billedAmount(response.getBilledAmount())
                .timestamp(LocalDateTime.now())
                .build();
        billingUpdatePublisher.publishAck(message);
    }

    @RabbitListener(queues = RabbitMQConfig.QUEUE_BILLING_ROLLBACK)
    @Retryable(
            retryFor = {WebServiceIOException.class},
            maxAttempts = 4,
            backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void compensateBilling(CompensateBillingMessage message) {
        CancelOrderBillingResponse response = cmsSoapClient.cancelOrderBilling(message.getOrderId());
        BillingUpdateMessage update = BillingUpdateMessage.builder()
                .orderId(response.getOrderId())
                .status(response.getStatus())
                .billedAmount(0D)
                .timestamp(LocalDateTime.now())
                .build();
        billingUpdatePublisher.publishAck(update);
    }

    @RabbitListener(queues = RabbitMQConfig.QUEUE_BILLING_COMPENSATION)
    @Retryable(
            retryFor = {WebServiceIOException.class},
            maxAttempts = 4,
            backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void compensateBillingWithDedicatedQueue(CompensateBillingMessage message) {
        CancelOrderBillingResponse response = cmsSoapClient.cancelOrderBilling(message.getOrderId());
        billingUpdatePublisher.publishAck(BillingUpdateMessage.builder()
                .messageId(message.getMessageId())
                .orderId(response.getOrderId())
                .status(response.getStatus())
                .billedAmount(0D)
                .timestamp(LocalDateTime.now())
                .build());
    }
}

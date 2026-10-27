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
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.AMQP;
import org.springframework.amqp.core.Message;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import com.swiftlogistics.cms_adapter.config.CmsCircuitBreakerConfig;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderConsumer {

    private final CmsSoapClient cmsSoapClient;
    private final BillingUpdatePublisher billingUpdatePublisher;

    @RabbitListener(
            id = CmsCircuitBreakerConfig.CMS_ORDER_LISTENER_ID,
            queues = RabbitMQConfig.QUEUE_ORDER_CREATED,
            containerFactory = "manualAckRabbitListenerContainerFactory")
    @Retryable(
            retryFor = {WebServiceIOException.class},
            maxAttempts = 4,
            backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void consumeOrder(OrderMessage orderMessage, Channel channel, Message message) {
        log.info(" Received Order from Orchestrator: {}", orderMessage);
        try {
            SubmitOrderResponse response = cmsSoapClient.submitOrder(
                    orderMessage.getOrderId(),
                    orderMessage.getCustomerId(),
                    orderMessage.getTotalAmount()
            );

            BillingUpdateMessage billingUpdate = BillingUpdateMessage.builder()
                    .orderId(response.getOrderId())
                    .status(response.getStatus())
                    .billedAmount(response.getBilledAmount())
                    .timestamp(LocalDateTime.now())
                    .build();
            billingUpdatePublisher.publishAck(billingUpdate);
            channel.basicAck(message.getMessageProperties().getDeliveryTag(), false);
        } catch (CallNotPermittedException exception) {
            log.warn("CMS circuit is OPEN; requeuing order {}", orderMessage.getOrderId());
            try {
                channel.basicNack(message.getMessageProperties().getDeliveryTag(), false, true);
            } catch (java.io.IOException nackException) {
                throw new IllegalStateException("Unable to requeue CMS order message", nackException);
            }
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("Unable to acknowledge CMS order message", exception);
        }
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

package com.swiftlogistics.cms_adapter;

import com.rabbitmq.client.Channel;
import com.swiftlogistics.cms_adapter.consumer.OrderConsumer;
import com.swiftlogistics.cms_adapter.model.BillingUpdateMessage;
import com.swiftlogistics.cms_adapter.model.OrderMessage;
import com.swiftlogistics.cms_adapter.producer.BillingUpdatePublisher;
import com.swiftlogistics.cms_adapter.service.IdempotentConsumerFilter;
import com.swiftlogistics.cms_adapter.soap.CmsSoapClient;
import com.swiftlogistics.cms_adapter.wsdl.SubmitOrderResponse;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.ws.client.WebServiceIOException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class OrderConsumerTest {

    private CmsSoapClient soapClient;
    private BillingUpdatePublisher publisher;
    private IdempotentConsumerFilter filter;
    private Channel channel;
    private OrderConsumer consumer;

    @BeforeEach
    void setUp() {
        soapClient = mock(CmsSoapClient.class);
        publisher = mock(BillingUpdatePublisher.class);
        filter = mock(IdempotentConsumerFilter.class);
        channel = mock(Channel.class);
        consumer = new OrderConsumer(soapClient, publisher, filter);
    }

    private static Message messageWithDeliveryTag(long deliveryTag) {
        MessageProperties properties = new MessageProperties();
        properties.setDeliveryTag(deliveryTag);
        return new Message(new byte[0], properties);
    }

    private static OrderMessage order(String id) {
        return OrderMessage.builder().orderId(id).build();
    }

    private BillingUpdateMessage publishedUpdate() {
        ArgumentCaptor<BillingUpdateMessage> captor = ArgumentCaptor.forClass(BillingUpdateMessage.class);
        verify(publisher).publishAck(captor.capture());
        return captor.getValue();
    }

    @Test
    void acknowledgesDuplicateBillingMessageWithoutCallingSoap() throws Exception {
        when(filter.tryAcquireLock("order-1:CMS_BILLING")).thenReturn(false);

        consumer.consumeOrder(order("order-1"), channel, messageWithDeliveryTag(11L), null, null);

        verify(channel).basicAck(11L, false);
        verifyNoInteractions(soapClient, publisher);
    }

    @Test
    void permanentSoapFailureFailsBillingAndAcknowledges() throws Exception {
        when(filter.tryAcquireLock("order-2:CMS_BILLING")).thenReturn(true);
        when(soapClient.submitOrder("order-2", null, null)).thenThrow(new RuntimeException("SOAP fault"));

        consumer.consumeOrder(order("order-2"), channel, messageWithDeliveryTag(12L), null, null);

        verify(filter).releaseLockOnFailure("order-2:CMS_BILLING");
        BillingUpdateMessage update = publishedUpdate();
        assertEquals("order-2", update.getOrderId());
        assertEquals("FAILED", update.getStatus());
        verify(channel).basicAck(12L, false);
        verify(channel, never()).basicNack(anyLong(), anyBoolean(), anyBoolean());
    }

    @Test
    void transportFailureIsRethrownSoRetryCanRun() throws Exception {
        when(filter.tryAcquireLock("order-3:CMS_BILLING")).thenReturn(true);
        when(soapClient.submitOrder("order-3", null, null)).thenThrow(new WebServiceIOException("connection refused"));

        assertThrows(WebServiceIOException.class,
                () -> consumer.consumeOrder(order("order-3"), channel, messageWithDeliveryTag(13L), null, null));

        verify(filter).releaseLockOnFailure("order-3:CMS_BILLING");
        verifyNoInteractions(publisher);
        verify(channel, never()).basicAck(anyLong(), anyBoolean());
    }

    @Test
    void openCircuitRequeuesWithoutFailingTheOrder() throws Exception {
        when(filter.tryAcquireLock("order-4:CMS_BILLING")).thenReturn(true);
        CircuitBreaker open = CircuitBreaker.ofDefaults("test");
        open.transitionToOpenState();
        when(soapClient.submitOrder("order-4", null, null))
                .thenThrow(CallNotPermittedException.createCallNotPermittedException(open));

        consumer.consumeOrder(order("order-4"), channel, messageWithDeliveryTag(14L), null, null);

        verify(channel).basicNack(14L, false, true);
        verify(filter).releaseLockOnFailure("order-4:CMS_BILLING");
        verifyNoInteractions(publisher);
    }

    @Test
    void failureToPublishAfterASuccessfulCallIsNotReportedAsBillingFailure() throws Exception {
        when(filter.tryAcquireLock("order-5:CMS_BILLING")).thenReturn(true);
        SubmitOrderResponse response = new SubmitOrderResponse();
        response.setOrderId("order-5");
        response.setStatus("BILLED");
        when(soapClient.submitOrder("order-5", null, null)).thenReturn(response);
        doThrow(new AmqpException("broker down")).when(publisher).publishAck(any());

        assertThrows(AmqpException.class,
                () -> consumer.consumeOrder(order("order-5"), channel, messageWithDeliveryTag(15L), null, null));

        verify(publisher, times(1)).publishAck(any()); // BILLED attempted; no FAILED claimed
        verify(filter).releaseLockOnFailure("order-5:CMS_BILLING");
        verify(channel, never()).basicAck(anyLong(), anyBoolean());
    }

    @Test
    void recoverMethodFailsBillingAndAcknowledgesAfterRetriesAreExhausted() throws Exception {
        consumer.consumeOrderFailed(new WebServiceIOException("down"), order("order-6"), channel,
                messageWithDeliveryTag(16L), "corr-1", null);

        assertEquals("FAILED", publishedUpdate().getStatus());
        verify(channel).basicAck(16L, false);
    }

    /** Runs the real Spring Retry proxy to prove @Recover is wired to the listener's signature. */
    @Test
    void exhaustedRetriesThroughTheRetryProxyEndInAFailedBillingUpdate() throws Exception {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(RetryConfig.class)) {
            CmsSoapClient soap = context.getBean(CmsSoapClient.class);
            BillingUpdatePublisher billingPublisher = context.getBean(BillingUpdatePublisher.class);
            IdempotentConsumerFilter lockFilter = context.getBean(IdempotentConsumerFilter.class);
            when(lockFilter.tryAcquireLock(anyString())).thenReturn(true);
            when(soap.submitOrder(any(), any(), any())).thenThrow(new WebServiceIOException("CMS down"));
            OrderConsumer proxied = context.getBean(OrderConsumer.class);

            proxied.consumeOrder(order("order-7"), channel, messageWithDeliveryTag(17L), null, null);

            verify(soap, times(4)).submitOrder(any(), any(), any()); // @Retryable(maxAttempts = 4)
            ArgumentCaptor<BillingUpdateMessage> captor = ArgumentCaptor.forClass(BillingUpdateMessage.class);
            verify(billingPublisher).publishAck(captor.capture());
            assertEquals("order-7", captor.getValue().getOrderId());
            assertEquals("FAILED", captor.getValue().getStatus());
            verify(channel).basicAck(17L, false);
        }
    }

    @Configuration
    @EnableRetry
    static class RetryConfig {
        @Bean
        CmsSoapClient cmsSoapClient() {
            return mock(CmsSoapClient.class);
        }

        @Bean
        BillingUpdatePublisher billingUpdatePublisher() {
            return mock(BillingUpdatePublisher.class);
        }

        @Bean
        IdempotentConsumerFilter idempotentConsumerFilter() {
            return mock(IdempotentConsumerFilter.class);
        }

        @Bean
        OrderConsumer orderConsumer(CmsSoapClient soap, BillingUpdatePublisher publisher,
                                    IdempotentConsumerFilter filter) {
            return new OrderConsumer(soap, publisher, filter);
        }
    }
}

package com.swiftlogistics.cms_adapter;

import com.rabbitmq.client.Channel;
import com.swiftlogistics.cms_adapter.consumer.OrderConsumer;
import com.swiftlogistics.cms_adapter.model.OrderMessage;
import com.swiftlogistics.cms_adapter.producer.BillingUpdatePublisher;
import com.swiftlogistics.cms_adapter.service.IdempotentConsumerFilter;
import com.swiftlogistics.cms_adapter.soap.CmsSoapClient;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class OrderConsumerTest {

    @Test
    void acknowledgesDuplicateBillingMessageWithoutCallingSoap() throws Exception {
        CmsSoapClient soapClient = mock(CmsSoapClient.class);
        BillingUpdatePublisher publisher = mock(BillingUpdatePublisher.class);
        IdempotentConsumerFilter filter = mock(IdempotentConsumerFilter.class);
        Channel channel = mock(Channel.class);
        when(filter.tryAcquireLock("order-1:CMS_BILLING")).thenReturn(false);
        Message message = messageWithDeliveryTag(11L);

        new OrderConsumer(soapClient, publisher, filter).consumeOrder(
                OrderMessage.builder().orderId("order-1").build(),
                channel, message, null, null);

        verify(channel).basicAck(11L, false);
        verifyNoInteractions(soapClient, publisher);
    }

    @Test
    void releasesBillingLockWhenSoapCallFails() throws Exception {
        CmsSoapClient soapClient = mock(CmsSoapClient.class);
        BillingUpdatePublisher publisher = mock(BillingUpdatePublisher.class);
        IdempotentConsumerFilter filter = mock(IdempotentConsumerFilter.class);
        Channel channel = mock(Channel.class);
        when(filter.tryAcquireLock("order-2:CMS_BILLING")).thenReturn(true);
        when(soapClient.submitOrder("order-2", null, null))
                .thenThrow(new RuntimeException("CMS unavailable"));

        assertThrows(RuntimeException.class, () -> new OrderConsumer(soapClient, publisher, filter)
                .consumeOrder(
                        OrderMessage.builder().orderId("order-2").build(),
                        channel, messageWithDeliveryTag(12L), null, null));

        verify(filter).releaseLockOnFailure("order-2:CMS_BILLING");
    }

    private Message messageWithDeliveryTag(long deliveryTag) {
        MessageProperties properties = new MessageProperties();
        properties.setDeliveryTag(deliveryTag);
        return new Message(new byte[0], properties);
    }
}

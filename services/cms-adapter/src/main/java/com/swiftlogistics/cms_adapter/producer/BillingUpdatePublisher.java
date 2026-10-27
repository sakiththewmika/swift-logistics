package com.swiftlogistics.cms_adapter.producer;

import com.swiftlogistics.cms_adapter.model.BillingUpdateMessage;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import com.swiftlogistics.cms_adapter.config.RabbitMQConfig;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class BillingUpdatePublisher {

    private final RabbitTemplate rabbitTemplate;

    public void publishAck(BillingUpdateMessage message) {
        if (message.getMessageId() == null) {
            message.setMessageId(UUID.randomUUID().toString());
        }
        rabbitTemplate.convertAndSend(
                RabbitMQConfig.EXCHANGE_BILLING_UPDATES,
                RabbitMQConfig.ROUTING_KEY_BILLING_UPDATES,
                message,
                outgoing -> {
                    outgoing.getMessageProperties().setMessageId(message.getMessageId());
                    return outgoing;
                }
        );

        log.info("Published CMS ACK: {}", message);
    }
}

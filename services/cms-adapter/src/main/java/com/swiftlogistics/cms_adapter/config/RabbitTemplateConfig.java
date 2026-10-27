package com.swiftlogistics.cms_adapter.config;

import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;

@Configuration
public class RabbitTemplateConfig {

    private final CachingConnectionFactory connectionFactory;

    public RabbitTemplateConfig(CachingConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
        this.connectionFactory.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);
        this.connectionFactory.setPublisherReturns(true);
    }

    @Bean
    public RabbitTemplate rabbitTemplate(Jackson2JsonMessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(converter);
        template.setMandatory(true); // ensure return callback triggered if undeliverable
        template.addBeforePublishPostProcessors(message -> {
            if (CorrelationIdContext.getCorrelationId() != null) {
                message.getMessageProperties().setHeader(CorrelationIdContext.HEADER_NAME,
                        CorrelationIdContext.getCorrelationId());
            }
            if (CorrelationIdContext.getTraceparent() != null) {
                message.getMessageProperties().setHeader(CorrelationIdContext.TRACEPARENT_HEADER,
                        CorrelationIdContext.getTraceparent());
            }
            return message;
        });
        return template;
    }

    @Bean
    public Jackson2JsonMessageConverter messageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }
}
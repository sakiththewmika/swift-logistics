package com.swiftlogistics.cms_adapter.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    // Step 1: Order Creation
    public static final String QUEUE_ORDER_CREATED = "order-created";
    public static final String EXCHANGE_ORDER_CREATED = "order-created.exchange";
    public static final String ROUTING_KEY_ORDER_CREATED = "order.created";

    // Step 2: Billing Updates
    public static final String QUEUE_BILLING_UPDATES = "billing-updates";
    public static final String EXCHANGE_BILLING_UPDATES = "billing-updates.exchange";
    public static final String ROUTING_KEY_BILLING_UPDATES = "billing.updated";
    public static final String QUEUE_BILLING_ROLLBACK = "billing-rollback";
    public static final String ROUTING_KEY_BILLING_ROLLBACK = "billing.rollback";

    // Dead-letter queues
    public static final String DLQ_SUFFIX = ".dlq";
    public static final String DLX_SUFFIX = ".dlx";

    @Bean
    public DirectExchange orderCreatedExchange() {
        return new DirectExchange(EXCHANGE_ORDER_CREATED, true, false);
    }

    @Bean
    public DirectExchange billingUpdatesExchange() {
        return new DirectExchange(EXCHANGE_BILLING_UPDATES, true, false);
    }

    @Bean
    public Queue orderCreatedQueue() {
        return QueueBuilder.durable(QUEUE_ORDER_CREATED)
                .withArgument("x-dead-letter-exchange", EXCHANGE_ORDER_CREATED + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_ORDER_CREATED + DLQ_SUFFIX)
                .build();
    }

    @Bean
    public Queue billingUpdatesQueue() {
        return QueueBuilder.durable(QUEUE_BILLING_UPDATES)
                .withArgument("x-dead-letter-exchange", EXCHANGE_BILLING_UPDATES + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_BILLING_UPDATES + DLQ_SUFFIX)
                .build();
    }

    @Bean
    public Binding bindingOrderCreated() {
        return BindingBuilder.bind(orderCreatedQueue()).to(orderCreatedExchange()).with(ROUTING_KEY_ORDER_CREATED);
    }

    @Bean
    public Binding bindingBillingUpdates() {
        return BindingBuilder.bind(billingUpdatesQueue()).to(billingUpdatesExchange()).with(ROUTING_KEY_BILLING_UPDATES);
    }

    @Bean
    public Queue billingRollbackQueue() {
        return QueueBuilder.durable(QUEUE_BILLING_ROLLBACK).build();
    }

    @Bean
    public Binding bindingBillingRollback() {
        return BindingBuilder.bind(billingRollbackQueue()).to(billingUpdatesExchange()).with(ROUTING_KEY_BILLING_ROLLBACK);
    }
}

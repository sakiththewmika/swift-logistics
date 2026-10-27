package com.swiftlogistics.orchestrator.config;

import org.springframework.amqp.core.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.ArrayList;
import java.util.List;

@Configuration
public class RabbitMQConfig {

    // === OPTIMIZED EVENT-DRIVEN QUEUES ===
    
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
    public static final String QUEUE_BILLING_COMPENSATION = "billing-compensation";
    public static final String ROUTING_KEY_BILLING_COMPENSATION = "billing.compensation";
    
    // Step 3: Warehouse Operations
    public static final String QUEUE_WAREHOUSE_QUEUE = "warehouse-queue";
    public static final String QUEUE_WAREHOUSE_UPDATES = "warehouse-updates";
    public static final String EXCHANGE_WAREHOUSE = "warehouse.exchange";
    public static final String ROUTING_KEY_WAREHOUSE_REQUEST = "warehouse.request";
    public static final String ROUTING_KEY_WAREHOUSE_UPDATE = "warehouse.update";
    public static final String QUEUE_WAREHOUSE_COMPENSATION = "warehouse-compensation";
    public static final String ROUTING_KEY_WAREHOUSE_COMPENSATION = "warehouse.compensation";
    
    // Step 4: Route Planning
    public static final String QUEUE_ROUTE_PLANNING = "route-planning";
    public static final String QUEUE_ROUTE_UPDATES = "route-updates";
    public static final String EXCHANGE_ROUTE = "route.exchange";
    public static final String ROUTING_KEY_ROUTE_PLANNING = "route.planning";
    public static final String ROUTING_KEY_ROUTE_UPDATE = "route.update";

    // Dead-letter queues
    public static final String DLQ_SUFFIX = ".dlq";
    public static final String DLX_SUFFIX = ".dlx";

    // === EXCHANGES ===
    
    @Bean
    public DirectExchange orderCreatedExchange() {
        return new DirectExchange(EXCHANGE_ORDER_CREATED, true, false);
    }
    
    @Bean
    public DirectExchange billingUpdatesExchange() {
        return new DirectExchange(EXCHANGE_BILLING_UPDATES, true, false);
    }
    
    @Bean
    public DirectExchange warehouseExchange() {
        return new DirectExchange(EXCHANGE_WAREHOUSE, true, false);
    }
    
    @Bean
    public DirectExchange routeExchange() {
        return new DirectExchange(EXCHANGE_ROUTE, true, false);
    }

    // === QUEUES ===
    
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
    public Queue billingRollbackQueue() {
        return QueueBuilder.durable(QUEUE_BILLING_ROLLBACK).build();
    }

    @Bean
    public Binding bindingBillingRollback() {
        return BindingBuilder.bind(billingRollbackQueue()).to(billingUpdatesExchange()).with(ROUTING_KEY_BILLING_ROLLBACK);
    }

    @Bean
    public Queue billingCompensationQueue() {
        return QueueBuilder.durable(QUEUE_BILLING_COMPENSATION)
                .withArgument("x-dead-letter-exchange", EXCHANGE_BILLING_UPDATES + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_BILLING_COMPENSATION + DLQ_SUFFIX)
                .build();
    }
    
    @Bean
    public Queue warehouseQueueRequest() {
        return QueueBuilder.durable(QUEUE_WAREHOUSE_QUEUE)
                .withArgument("x-dead-letter-exchange", EXCHANGE_WAREHOUSE + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_WAREHOUSE_QUEUE + DLQ_SUFFIX)
                .build();
    }
    
    @Bean
    public Queue warehouseUpdatesQueue() {
        return QueueBuilder.durable(QUEUE_WAREHOUSE_UPDATES)
                .withArgument("x-dead-letter-exchange", EXCHANGE_WAREHOUSE + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_WAREHOUSE_UPDATES + DLQ_SUFFIX)
                .build();
    }

    @Bean
    public Queue warehouseCompensationQueue() {
        return QueueBuilder.durable(QUEUE_WAREHOUSE_COMPENSATION)
                .withArgument("x-dead-letter-exchange", EXCHANGE_WAREHOUSE + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_WAREHOUSE_COMPENSATION + DLQ_SUFFIX)
                .build();
    }
    
    @Bean
    public Queue routePlanningQueue() {
        return QueueBuilder.durable(QUEUE_ROUTE_PLANNING)
                .withArgument("x-dead-letter-exchange", EXCHANGE_ROUTE + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_ROUTE_PLANNING + DLQ_SUFFIX)
                .build();
    }
    
    @Bean
    public Queue routeUpdatesQueue() {
        return QueueBuilder.durable(QUEUE_ROUTE_UPDATES)
                .withArgument("x-dead-letter-exchange", EXCHANGE_ROUTE + DLX_SUFFIX)
                .withArgument("x-dead-letter-routing-key", QUEUE_ROUTE_UPDATES + DLQ_SUFFIX)
                .build();
    }

    // === BINDINGS ===
    
    @Bean
    public Binding bindingOrderCreated() {
        return BindingBuilder.bind(orderCreatedQueue()).to(orderCreatedExchange()).with(ROUTING_KEY_ORDER_CREATED);
    }
    
    @Bean
    public Binding bindingBillingUpdates() {
        return BindingBuilder.bind(billingUpdatesQueue()).to(billingUpdatesExchange()).with(ROUTING_KEY_BILLING_UPDATES);
    }
    
    @Bean
    public Binding bindingWarehouseRequest() {
        return BindingBuilder.bind(warehouseQueueRequest()).to(warehouseExchange()).with(ROUTING_KEY_WAREHOUSE_REQUEST);
    }
    
    @Bean
    public Binding bindingWarehouseUpdates() {
        return BindingBuilder.bind(warehouseUpdatesQueue()).to(warehouseExchange()).with(ROUTING_KEY_WAREHOUSE_UPDATE);
    }

    @Bean
    public Binding bindingBillingCompensation() {
        return BindingBuilder.bind(billingCompensationQueue())
                .to(billingUpdatesExchange())
                .with(ROUTING_KEY_BILLING_COMPENSATION);
    }

    @Bean
    public Binding bindingWarehouseCompensation() {
        return BindingBuilder.bind(warehouseCompensationQueue())
                .to(warehouseExchange())
                .with(ROUTING_KEY_WAREHOUSE_COMPENSATION);
    }
    
    @Bean
    public Binding bindingRoutePlanning() {
        return BindingBuilder.bind(routePlanningQueue()).to(routeExchange()).with(ROUTING_KEY_ROUTE_PLANNING);
    }
    
    @Bean
    public Binding bindingRouteUpdates() {
        return BindingBuilder.bind(routeUpdatesQueue()).to(routeExchange()).with(ROUTING_KEY_ROUTE_UPDATE);
    }

    @Bean
    public Declarables deadLetterTopology() {
        String[][] queues = {
                {QUEUE_ORDER_CREATED, EXCHANGE_ORDER_CREATED},
                {QUEUE_BILLING_UPDATES, EXCHANGE_BILLING_UPDATES},
                {QUEUE_BILLING_ROLLBACK, EXCHANGE_BILLING_UPDATES},
                {QUEUE_BILLING_COMPENSATION, EXCHANGE_BILLING_UPDATES},
                {QUEUE_WAREHOUSE_QUEUE, EXCHANGE_WAREHOUSE},
                {QUEUE_WAREHOUSE_UPDATES, EXCHANGE_WAREHOUSE},
                {QUEUE_WAREHOUSE_COMPENSATION, EXCHANGE_WAREHOUSE},
                {QUEUE_ROUTE_PLANNING, EXCHANGE_ROUTE},
                {QUEUE_ROUTE_UPDATES, EXCHANGE_ROUTE}
        };
        List<Declarable> declarables = new ArrayList<>();
        for (String[] entry : queues) {
            String queueName = entry[0] + DLQ_SUFFIX;
            DirectExchange exchange = new DirectExchange(entry[1] + DLX_SUFFIX, true, false);
            Queue queue = QueueBuilder.durable(queueName).build();
            declarables.add(exchange);
            declarables.add(queue);
            declarables.add(BindingBuilder.bind(queue).to(exchange).with(queueName));
        }
        return new Declarables(declarables);
    }
}

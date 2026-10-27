package com.swiftlogistics.cms_adapter.config;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.core.AcknowledgeMode;
import org.springframework.amqp.rabbit.listener.RabbitListenerEndpointRegistry;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class CmsCircuitBreakerConfig {

    public static final String CMS_ORDER_LISTENER_ID = "cmsOrderCreatedListener";

    @Bean
    public SimpleRabbitListenerContainerFactory manualAckRabbitListenerContainerFactory(
            ConnectionFactory connectionFactory,
            Jackson2JsonMessageConverter messageConverter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        factory.setPrefetchCount(1);
        factory.setMessageConverter(messageConverter);
        return factory;
    }

    @Bean(destroyMethod = "shutdown")
    public ScheduledExecutorService circuitBreakerScheduler() {
        return Executors.newSingleThreadScheduledExecutor();
    }

    @Bean
    public CmsCircuitBreakerListener cmsCircuitBreakerListener(
            CircuitBreakerRegistry registry,
            RabbitListenerEndpointRegistry listenerRegistry,
            ScheduledExecutorService scheduler) {
        return new CmsCircuitBreakerListener(registry, listenerRegistry, scheduler);
    }

    public static final class CmsCircuitBreakerListener {
        private final RabbitListenerEndpointRegistry listenerRegistry;
        private final ScheduledExecutorService scheduler;
        private final AtomicBoolean resumeScheduled = new AtomicBoolean();

        private CmsCircuitBreakerListener(
                CircuitBreakerRegistry registry,
                RabbitListenerEndpointRegistry listenerRegistry,
                ScheduledExecutorService scheduler) {
            this.listenerRegistry = listenerRegistry;
            this.scheduler = scheduler;
            CircuitBreaker breaker = registry.circuitBreaker("cmsSoapBreaker");
            breaker.getEventPublisher().onStateTransition(event -> {
                if (event.getStateTransition() == CircuitBreaker.StateTransition.CLOSED_TO_OPEN) {
                    pauseAndScheduleResume();
                }
            });
        }

        private void pauseAndScheduleResume() {
            var container = listenerRegistry.getListenerContainer(CMS_ORDER_LISTENER_ID);
            if (container != null && container.isRunning()) {
                log.warn("CMS circuit is OPEN; pausing order-created consumption");
                container.stop();
            }
            if (resumeScheduled.compareAndSet(false, true)) {
                scheduler.schedule(() -> {
                    try {
                        var resumedContainer = listenerRegistry.getListenerContainer(CMS_ORDER_LISTENER_ID);
                        if (resumedContainer != null && !resumedContainer.isRunning()) {
                            log.info("Resuming order-created consumption for CMS circuit half-open probe");
                            resumedContainer.start();
                        }
                    } finally {
                        resumeScheduled.set(false);
                    }
                }, 30, java.util.concurrent.TimeUnit.SECONDS);
            }
        }
    }
}

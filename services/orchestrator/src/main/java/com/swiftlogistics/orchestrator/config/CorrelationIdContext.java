package com.swiftlogistics.orchestrator.config;

import org.slf4j.MDC;

import java.util.UUID;

public final class CorrelationIdContext {
    public static final String HEADER_NAME = "X-Correlation-Id";
    public static final String TRACEPARENT_HEADER = "traceparent";

    private static final ThreadLocal<String> CORRELATION_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> TRACEPARENT = new ThreadLocal<>();

    private CorrelationIdContext() {
    }

    public static String getOrCreateCorrelationId() {
        String correlationId = CORRELATION_ID.get();
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
            setCorrelationId(correlationId);
        }
        return correlationId;
    }

    public static String getCorrelationId() {
        return CORRELATION_ID.get();
    }

    public static void setCorrelationId(String correlationId) {
        CORRELATION_ID.set(correlationId);
        MDC.put("correlationId", correlationId);
    }

    public static String getTraceparent() {
        return TRACEPARENT.get();
    }

    public static void setTraceparent(String traceparent) {
        if (traceparent == null || traceparent.isBlank()) {
            TRACEPARENT.remove();
        } else {
            TRACEPARENT.set(traceparent);
        }
    }

    public static void setFromHeaders(String correlationId, String traceparent) {
        if (correlationId != null && !correlationId.isBlank()) {
            setCorrelationId(correlationId);
        }
        setTraceparent(traceparent);
    }

    public static void clear() {
        CORRELATION_ID.remove();
        TRACEPARENT.remove();
        MDC.remove("correlationId");
    }
}

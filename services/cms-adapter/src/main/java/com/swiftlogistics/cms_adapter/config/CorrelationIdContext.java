package com.swiftlogistics.cms_adapter.config;

import org.slf4j.MDC;

public final class CorrelationIdContext {
    public static final String HEADER_NAME = "X-Correlation-Id";
    public static final String TRACEPARENT_HEADER = "traceparent";

    private static final ThreadLocal<String> CORRELATION_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> TRACEPARENT = new ThreadLocal<>();

    private CorrelationIdContext() {
    }

    public static void setFromHeaders(String correlationId, String traceparent) {
        if (correlationId != null && !correlationId.isBlank()) {
            CORRELATION_ID.set(correlationId);
            MDC.put("correlationId", correlationId);
        }
        if (traceparent != null && !traceparent.isBlank()) {
            TRACEPARENT.set(traceparent);
        }
    }

    public static String getCorrelationId() {
        return CORRELATION_ID.get();
    }

    public static String getTraceparent() {
        return TRACEPARENT.get();
    }

    public static void clear() {
        CORRELATION_ID.remove();
        TRACEPARENT.remove();
        MDC.remove("correlationId");
    }
}

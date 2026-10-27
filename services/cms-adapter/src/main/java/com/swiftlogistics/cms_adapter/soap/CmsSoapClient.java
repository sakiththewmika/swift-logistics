package com.swiftlogistics.cms_adapter.soap;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.Callable;

import com.swiftlogistics.cms_adapter.wsdl.SubmitOrderRequest;
import com.swiftlogistics.cms_adapter.wsdl.SubmitOrderResponse;
import com.swiftlogistics.cms_adapter.wsdl.CancelInvoiceRequest;
import com.swiftlogistics.cms_adapter.wsdl.CancelInvoiceResponse;
import com.swiftlogistics.cms_adapter.wsdl.CancelOrderBillingRequest;
import com.swiftlogistics.cms_adapter.wsdl.CancelOrderBillingResponse;
import org.springframework.ws.client.core.support.WebServiceGatewaySupport;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.timelimiter.TimeLimiter;
import io.github.resilience4j.timelimiter.TimeLimiterRegistry;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class CmsSoapClient extends WebServiceGatewaySupport {

    private final CircuitBreaker circuitBreaker;
    private final TimeLimiter timeLimiter;

    public CmsSoapClient(
            CircuitBreakerRegistry circuitBreakerRegistry,
            TimeLimiterRegistry timeLimiterRegistry) {
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker("cmsSoapBreaker");
        this.timeLimiter = timeLimiterRegistry.timeLimiter("cmsSoapBreaker");
    }

    public SubmitOrderResponse submitOrder(String orderId, String clientId, Double amount) {
        SubmitOrderRequest request = new SubmitOrderRequest();
        request.setOrderId(orderId);
        request.setClientId(clientId);
        request.setAmount(amount);

        log.info("➡️ Sending SOAP request to CMS: {}", orderId);

        SubmitOrderResponse response = execute(() -> (SubmitOrderResponse) getWebServiceTemplate()
                .marshalSendAndReceive(request));

        log.info("⬅️ Received SOAP response from CMS: {}", response.getStatus());

        return response;
    }

    public CancelInvoiceResponse cancelInvoice(String orderId) {
        CancelInvoiceRequest request = new CancelInvoiceRequest();
        request.setOrderId(orderId);
        return execute(() -> (CancelInvoiceResponse) getWebServiceTemplate().marshalSendAndReceive(request));
    }

    public CancelOrderBillingResponse cancelOrderBilling(String orderId) {
        CancelOrderBillingRequest request = new CancelOrderBillingRequest();
        request.setOrderId(orderId);
        return execute(() -> (CancelOrderBillingResponse) getWebServiceTemplate().marshalSendAndReceive(request));
    }

    private <T> T execute(Callable<T> operation) {
        return circuitBreaker.executeSupplier(() -> {
            CompletableFuture<T> future = CompletableFuture.supplyAsync(() -> {
                try {
                    return operation.call();
                } catch (Exception exception) {
                    throw new OperationFailureException(exception);
                }
            });
            try {
                return future.get(timeLimiter.getTimeLimiterConfig().getTimeoutDuration().toMillis(),
                        TimeUnit.MILLISECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("CMS SOAP call was interrupted", exception);
            } catch (TimeoutException exception) {
                future.cancel(true);
                throw new IllegalStateException("CMS SOAP call timed out", exception);
            } catch (ExecutionException exception) {
                Throwable cause = exception.getCause();
                if (cause instanceof OperationFailureException failure
                        && failure.getCause() instanceof RuntimeException runtimeException) {
                    throw runtimeException;
                }
                throw new IllegalStateException("CMS SOAP call failed", cause);
            }
        });
    }

    private static final class OperationFailureException extends RuntimeException {
        private OperationFailureException(Exception cause) {
            super(cause);
        }
    }
}
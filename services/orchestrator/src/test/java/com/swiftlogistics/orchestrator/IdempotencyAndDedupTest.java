package com.swiftlogistics.orchestrator;

import com.swiftlogistics.orchestrator.controller.OrderController;
import com.swiftlogistics.orchestrator.dto.CreateOrderRequest;
import com.swiftlogistics.orchestrator.model.IdempotencyRecord;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.ProcessedMessage;
import com.swiftlogistics.orchestrator.repository.IdempotencyRecordRepository;
import com.swiftlogistics.orchestrator.repository.ProcessedMessageRepository;
import com.swiftlogistics.orchestrator.service.EventService;
import com.swiftlogistics.orchestrator.service.IdempotentConsumerFilter;
import com.swiftlogistics.orchestrator.service.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class IdempotencyAndDedupTest {

    @Test
    void acquiresOnlyTheFirstConsumerLock() {
        ProcessedMessageRepository repository = mock(ProcessedMessageRepository.class);
        IdempotentConsumerFilter filter = new IdempotentConsumerFilter(repository);
        when(repository.insert(any(ProcessedMessage.class)))
                .thenReturn(null)
                .thenThrow(new DuplicateKeyException("duplicate"));

        assertTrue(filter.tryAcquireLock("order-1:CMS_BILLING"));
        assertFalse(filter.tryAcquireLock("order-1:CMS_BILLING"));
    }

    @Test
    void releasesConsumerLockForRetry() {
        ProcessedMessageRepository repository = mock(ProcessedMessageRepository.class);
        IdempotentConsumerFilter filter = new IdempotentConsumerFilter(repository);

        filter.releaseLockOnFailure("order-1:CMS_BILLING");

        verify(repository).deleteById("order-1:CMS_BILLING");
    }

    @Test
    void returnsExistingOrderForDuplicateIdempotencyKey() {
        OrderService orderService = mock(OrderService.class);
        IdempotencyRecordRepository idempotencyRepository = mock(IdempotencyRecordRepository.class);
        EventService eventService = mock(EventService.class);
        Order existingOrder = Order.builder().orderId("order-1").build();
        IdempotencyRecord record = new IdempotencyRecord("key-1", "order-1", Instant.now());
        when(idempotencyRepository.insert(any(IdempotencyRecord.class)))
                .thenThrow(new DuplicateKeyException("duplicate"));
        when(idempotencyRepository.findById("key-1")).thenReturn(Optional.of(record));
        when(orderService.getOrder("order-1")).thenReturn(Optional.of(existingOrder));

        OrderController controller = new OrderController(orderService, eventService, idempotencyRepository);

        ResponseEntity<Order> response = controller.createOrder("key-1", new CreateOrderRequest());

        assertEquals(200, response.getStatusCode().value());
        assertSame(existingOrder, response.getBody());
        verify(orderService).getOrder("order-1");
    }

    @Test
    void rejectsMissingIdempotencyKey() {
        OrderController controller = new OrderController(
                mock(OrderService.class),
                mock(EventService.class),
                mock(IdempotencyRecordRepository.class));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.createOrder(" ", new CreateOrderRequest()));

        assertEquals(400, exception.getStatusCode().value());
    }
}

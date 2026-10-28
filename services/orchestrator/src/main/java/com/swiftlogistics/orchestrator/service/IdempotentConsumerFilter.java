package com.swiftlogistics.orchestrator.service;

import com.swiftlogistics.orchestrator.model.ProcessedMessage;
import com.swiftlogistics.orchestrator.repository.ProcessedMessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
@RequiredArgsConstructor
public class IdempotentConsumerFilter {
    private final ProcessedMessageRepository repository;

    public boolean tryAcquireLock(String businessKey) {
        if (businessKey == null || businessKey.isBlank()) {
            return false;
        }
        try {
            repository.insert(new ProcessedMessage(businessKey, Instant.now()));
            return true;
        } catch (DuplicateKeyException duplicate) {
            return false;
        }
    }

    public void releaseLockOnFailure(String businessKey) {
        if (businessKey != null && !businessKey.isBlank()) {
            repository.deleteById(businessKey);
        }
    }
}

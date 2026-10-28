package com.swiftlogistics.cms_adapter.service;

import com.swiftlogistics.cms_adapter.model.ProcessedMessage;
import com.swiftlogistics.cms_adapter.repository.ProcessedMessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
@RequiredArgsConstructor
public class IdempotentConsumerFilter {
    private final ProcessedMessageRepository repository;

    public boolean tryAcquireLock(String businessKey) {
        try {
            repository.insert(new ProcessedMessage(businessKey, Instant.now()));
            return true;
        } catch (DuplicateKeyException duplicate) {
            return false;
        }
    }

    public void releaseLockOnFailure(String businessKey) {
        repository.deleteById(businessKey);
    }
}

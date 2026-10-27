package com.swiftlogistics.orchestrator.repository;

import com.swiftlogistics.orchestrator.model.ProcessedMessage;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProcessedMessageRepository extends MongoRepository<ProcessedMessage, String> {
}

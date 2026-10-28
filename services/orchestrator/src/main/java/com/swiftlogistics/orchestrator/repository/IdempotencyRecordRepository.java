package com.swiftlogistics.orchestrator.repository;

import com.swiftlogistics.orchestrator.model.IdempotencyRecord;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface IdempotencyRecordRepository extends MongoRepository<IdempotencyRecord, String> {
}

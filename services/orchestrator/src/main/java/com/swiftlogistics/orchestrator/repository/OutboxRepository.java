package com.swiftlogistics.orchestrator.repository;

import com.swiftlogistics.orchestrator.model.OutboxEvent;
import com.swiftlogistics.orchestrator.model.enums.OutboxStatus;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OutboxRepository extends MongoRepository<OutboxEvent, String> {

    List<OutboxEvent> findByStatusOrderByCreatedAtAsc(OutboxStatus outboxStatus);
}

package com.swiftlogistics.cms_adapter.repository;

import com.swiftlogistics.cms_adapter.model.ProcessedMessage;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProcessedMessageRepository extends MongoRepository<ProcessedMessage, String> {
}

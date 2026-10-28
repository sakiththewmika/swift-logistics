package com.swiftlogistics.cms_adapter.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "cms_processed_messages")
public class ProcessedMessage {
    @Id
    private String businessKey;

    @Indexed(expireAfter = "30d")
    private Instant processedAt;
}

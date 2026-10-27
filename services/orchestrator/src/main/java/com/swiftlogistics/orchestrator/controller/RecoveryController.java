package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.service.RecoveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/recovery")
@RequiredArgsConstructor
public class RecoveryController {
    private final RecoveryService recoveryService;

    @PostMapping("/replay")
    public ResponseEntity<Map<String, Object>> replay(
            @RequestParam String queue,
            @RequestParam(defaultValue = "10") int limit) {
        int replayed = recoveryService.replay(queue, limit);
        return ResponseEntity.ok(Map.of("queue", queue, "replayed", replayed));
    }
}

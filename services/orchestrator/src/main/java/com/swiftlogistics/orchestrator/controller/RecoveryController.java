package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.security.AccessGuard;
import com.swiftlogistics.orchestrator.service.RecoveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/recovery")
@RequiredArgsConstructor
public class RecoveryController {
    private static final int MAX_REPLAY_LIMIT = 100;

    private final RecoveryService recoveryService;

    @PostMapping("/replay")
    public ResponseEntity<Map<String, Object>> replay(
            @RequestParam String queue,
            @RequestParam(defaultValue = "10") int limit) {
        // Demo console users sign in as customers, so customers and admins may replay; drivers may not.
        AccessGuard.requireAnyRole(AccessGuard.ROLE_CUSTOMER, AccessGuard.ROLE_ADMIN);
        if (limit < 1 || limit > MAX_REPLAY_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "limit must be between 1 and " + MAX_REPLAY_LIMIT);
        }
        int replayed;
        try {
            replayed = recoveryService.replay(queue, limit);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        return ResponseEntity.ok(Map.of("queue", queue, "replayed", replayed));
    }
}

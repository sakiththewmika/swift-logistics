package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.dto.DriverUpdateMessage;
import com.swiftlogistics.orchestrator.dto.ProofOfDeliveryRequest;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.security.AccessGuard;
import com.swiftlogistics.orchestrator.service.DriverService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/drivers")
@RequiredArgsConstructor
@Slf4j
public class DriverController {

    private final DriverService driverService;

    /**
     * Get orders for driver
     */
    @GetMapping("/driver/{driverId}")
    public ResponseEntity<List<Order>> getOrdersByDriver(@PathVariable String driverId) {
        AccessGuard.requireAnyRole(AccessGuard.ROLE_DRIVER, AccessGuard.ROLE_ADMIN);
        AccessGuard.requireOwnerOrAdmin(driverId);
        List<Order> orders = driverService.getPendingOrdersForDriver(driverId);
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<DriverUpdateMessage> getOrder(@PathVariable String orderId) {
        AccessGuard.requireAnyRole(AccessGuard.ROLE_DRIVER, AccessGuard.ROLE_ADMIN);
        DriverUpdateMessage order = driverService.getOrderDetails(orderId);
        AccessGuard.requireOwnerOrAdmin(order.getDriverId());
        return ResponseEntity.ok(order);
    }

    @PutMapping("/driver/start/{orderId}")
    public ResponseEntity<Void> startDelivery(@PathVariable String orderId) {
        AccessGuard.requireAnyRole(AccessGuard.ROLE_DRIVER, AccessGuard.ROLE_ADMIN);
        driverService.assertDriverOwnsOrder(orderId);
        try {
            driverService.startDelivery(orderId);
            return ResponseEntity.ok().build();
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to start delivery for order: {}", orderId, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to start delivery");
        }
    }

    @PutMapping("/driver/complete/{orderId}")
    public ResponseEntity<Void> completeDelivery(@PathVariable String orderId) {
        AccessGuard.requireAnyRole(AccessGuard.ROLE_DRIVER, AccessGuard.ROLE_ADMIN);
        driverService.assertDriverOwnsOrder(orderId);
        try {
            driverService.completeDelivery(orderId);
            return ResponseEntity.ok().build();
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to complete delivery for order: {}", orderId, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to complete delivery");
        }
    }

    @PostMapping("/driver/{driverId}/orders/{orderId}/pod")
    public ResponseEntity<Void> submitProofOfDelivery(
            @PathVariable String driverId,
            @PathVariable String orderId,
            @Valid @RequestBody ProofOfDeliveryRequest request) {
        AccessGuard.requireAnyRole(AccessGuard.ROLE_DRIVER, AccessGuard.ROLE_ADMIN);
        AccessGuard.requireOwnerOrAdmin(driverId);
        try {
            driverService.recordProofOfDelivery(driverId, orderId, request);
            return ResponseEntity.ok().build();
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            log.warn("Invalid POD submission for order {}: {}", orderId, e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (Exception e) {
            log.error("Failed to submit POD for order {}", orderId, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to submit proof of delivery");
        }
    }

}

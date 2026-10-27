package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.dto.DriverUpdateMessage;
import com.swiftlogistics.orchestrator.dto.ProofOfDeliveryRequest;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.service.DriverService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
        List<Order> orders = driverService.getPendingOrdersForDriver(driverId);
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<DriverUpdateMessage> getOrder(@PathVariable String orderId) {
        DriverUpdateMessage order = driverService.getOrderDetails(orderId);
        return ResponseEntity.ok(order);
    }

    @PutMapping("/driver/start/{orderId}")
    public ResponseEntity<Void> startDelivery(@PathVariable String orderId) {
        try {
            driverService.startDelivery(orderId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Failed to start delivery for order: {}", orderId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/driver/complete/{orderId}")
    public ResponseEntity<Void> completeDelivery(@PathVariable String orderId) {
        try {
            driverService.completeDelivery(orderId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Failed to complete delivery for order: {}", orderId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/driver/{driverId}/orders/{orderId}/pod")
    public ResponseEntity<Void> submitProofOfDelivery(
            @PathVariable String driverId,
            @PathVariable String orderId,
            @RequestBody ProofOfDeliveryRequest request) {
        try {
            driverService.recordProofOfDelivery(driverId, orderId, request);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            log.warn("Invalid POD submission for order {}: {}", orderId, e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            log.error("Failed to submit POD for order {}", orderId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

}

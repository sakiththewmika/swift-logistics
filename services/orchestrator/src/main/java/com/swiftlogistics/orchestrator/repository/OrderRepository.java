package com.swiftlogistics.orchestrator.repository;

import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

@Repository
public interface OrderRepository extends MongoRepository<Order, String> {
    
    // Find orders by customer
    List<Order> findByCustomerId(String customerId);
    
    // Find orders by status
    List<Order> findByStatus(OrderStatus status);

    List<Order> findByStatusAndDriverId(OrderStatus status, String driverId);

    List<Order> findByStatusInAndDriverId(Collection<OrderStatus> statuses, String driverId);
}
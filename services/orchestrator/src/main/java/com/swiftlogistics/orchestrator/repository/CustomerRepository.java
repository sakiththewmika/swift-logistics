package com.swiftlogistics.orchestrator.repository;

import com.swiftlogistics.orchestrator.model.Customer;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface CustomerRepository extends MongoRepository<Customer, String> {

  Customer findCustomerByCustomerName(String customerId);

  Customer findCustomerByCustomerEmail(String customerEmail);

}

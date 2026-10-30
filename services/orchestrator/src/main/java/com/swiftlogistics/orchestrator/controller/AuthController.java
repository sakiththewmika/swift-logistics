package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.model.Customer;
import com.swiftlogistics.orchestrator.model.Driver;
import com.swiftlogistics.orchestrator.dto.LoginRequest;
import com.swiftlogistics.orchestrator.repository.CustomerRepository;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class AuthController {
  private final CustomerRepository customerRepository;
  private final DriverRepository driverRepository;

  //  Mock Auth functionality
  @PostMapping("/customer")
  public ResponseEntity<?> login(@RequestBody LoginRequest loginRequest) {
    if (loginRequest.getUsername() == null || loginRequest.getUsername().isEmpty()) {
      return ResponseEntity.status(400).body("Customer name is required");
    }
    if (loginRequest.getPassword() == null || loginRequest.getPassword().isEmpty()) {
      return ResponseEntity.status(400).body("Password is required");
    }
    Customer customer = customerRepository.findCustomerByCustomerName(loginRequest.getUsername());
    if (customer == null) {
      customer = customerRepository.findCustomerByCustomerEmail(loginRequest.getUsername());
    }
    if (customer == null) {
      return ResponseEntity.status(401).body("Customer not found");
    }
    if (!customer.getPassword().equals(loginRequest.getPassword())) {
      return ResponseEntity.status(401).body("Invalid password");
    }
    // Remove password before returning customer details
    customer.setPassword(null);
    return ResponseEntity.ok(customer);
  }

  @PostMapping("/driver")
  public ResponseEntity<?> driverLogin(@RequestBody LoginRequest loginRequest) {
    if (loginRequest.getUsername() == null || loginRequest.getUsername().isEmpty()) {
      return ResponseEntity.status(400).body("Driver name is required");
    }
    if (loginRequest.getPassword() == null || loginRequest.getPassword().isEmpty()) {
      return ResponseEntity.status(400).body("Password is required");
    }
    Driver driver = driverRepository.findDriverByDriverName(loginRequest.getUsername());
    if (driver == null) {
      driver = driverRepository.findDriverByDriverEmail(loginRequest.getUsername());
    }
    if (driver == null) {
      driver = driverRepository.findDriverByName(loginRequest.getUsername());
    }
    if (driver == null) {
      driver = driverRepository.findById(loginRequest.getUsername()).orElse(null);
    }
    if (driver == null) {
      return ResponseEntity.status(401).body("Driver not found");
    }
    if (!driver.getPassword().equals(loginRequest.getPassword())) {
      return ResponseEntity.status(401).body("Invalid password");
    }

    driver.setAvailable(true);

    driverRepository.save(driver);

    driver.setPassword(null);
    return ResponseEntity.ok(driver);
  }

  @PostMapping("/driver-logout")
  public ResponseEntity<?> driverLogout(@RequestBody(required = false) LoginRequest loginRequest) {
    if (loginRequest != null && loginRequest.getUsername() != null) {
      Driver driver = driverRepository.findDriverByDriverName(loginRequest.getUsername());
      if (driver == null) {
        driver = driverRepository.findDriverByDriverEmail(loginRequest.getUsername());
      }
      if (driver == null) {
        driver = driverRepository.findDriverByName(loginRequest.getUsername());
      }
      if (driver == null) {
        driver = driverRepository.findById(loginRequest.getUsername()).orElse(null);
      }
      if (driver != null) {
        driver.setAvailable(false);
        driverRepository.save(driver);
      }
    }
    return ResponseEntity.ok("Logged out successfully");
  }

  @PostMapping("/sign-up")
  public ResponseEntity<?> signUp(@RequestBody Customer customer) {
    if (customer.getCustomerName() == null || customer.getCustomerName().isEmpty()) {
      return ResponseEntity.status(400).body("Customer name is required");
    }
    if (customer.getPassword() == null || customer.getPassword().isEmpty()) {
      return ResponseEntity.status(400).body("Password is required");
    }
    if (customerRepository.findCustomerByCustomerName(customer.getCustomerName()) != null) {
      return ResponseEntity.status(400).body("Customer already exists");
    }
    Customer savedCustomer = customerRepository.save(customer);
    savedCustomer.setPassword(null);
    return ResponseEntity.ok(savedCustomer);
  }

  @PostMapping("/driver-sign-up")
  public ResponseEntity<?> driverSignUp(@RequestBody Driver driver) {
    if (driver.getDriverName() == null || driver.getDriverName().isEmpty()) {
      return ResponseEntity.status(400).body("Driver name is required");
    }
    if (driver.getPassword() == null || driver.getPassword().isEmpty()) {
      return ResponseEntity.status(400).body("Password is required");
    }
    if (driverRepository.findDriverByDriverName(driver.getDriverName()) != null) {
      return ResponseEntity.status(400).body("Driver already exists");
    }
    Driver token = driverRepository.save(driver);
    token.setPassword(null);
    return ResponseEntity.ok(token);
  }
}

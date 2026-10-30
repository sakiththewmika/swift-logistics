package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.model.Customer;
import com.swiftlogistics.orchestrator.model.Driver;
import com.swiftlogistics.orchestrator.dto.LoginRequest;
import com.swiftlogistics.orchestrator.repository.CustomerRepository;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import com.swiftlogistics.orchestrator.security.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
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
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  /**
   * Supports verifying both modern BCrypt hashed passwords and legacy plain-text passwords.
   */
  private boolean verifyPassword(String rawPassword, String storedPassword) {
    if (storedPassword == null || rawPassword == null) {
      return false;
    }
    if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$")) {
      return passwordEncoder.matches(rawPassword, storedPassword);
    }
    return storedPassword.equals(rawPassword);
  }

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
    if (!verifyPassword(loginRequest.getPassword(), customer.getPassword())) {
      return ResponseEntity.status(401).body("Invalid password");
    }

    // Upgrade legacy plain-text password to BCrypt hash transparently
    if (!customer.getPassword().startsWith("$2")) {
      customer.setPassword(passwordEncoder.encode(loginRequest.getPassword()));
      customerRepository.save(customer);
    }

    String token = jwtService.generateToken(
        customer.getCustomerId(),
        customer.getCustomerEmail() != null ? customer.getCustomerEmail() : customer.getCustomerName(),
        "CUSTOMER"
    );

    customer.setPassword(null);
    customer.setToken(token);
    customer.setAccessToken(token);
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
    if (!verifyPassword(loginRequest.getPassword(), driver.getPassword())) {
      return ResponseEntity.status(401).body("Invalid password");
    }

    // Upgrade legacy plain-text password to BCrypt hash transparently
    if (!driver.getPassword().startsWith("$2")) {
      driver.setPassword(passwordEncoder.encode(loginRequest.getPassword()));
    }

    driver.setAvailable(true);
    driverRepository.save(driver);

    String token = jwtService.generateToken(
        driver.getDriverId(),
        driver.getDriverEmail() != null ? driver.getDriverEmail() : driver.getDriverName(),
        "DRIVER"
    );

    driver.setPassword(null);
    driver.setToken(token);
    driver.setAccessToken(token);
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

    customer.setPassword(passwordEncoder.encode(customer.getPassword()));
    Customer savedCustomer = customerRepository.save(customer);

    String token = jwtService.generateToken(
        savedCustomer.getCustomerId(),
        savedCustomer.getCustomerEmail() != null ? savedCustomer.getCustomerEmail() : savedCustomer.getCustomerName(),
        "CUSTOMER"
    );

    savedCustomer.setPassword(null);
    savedCustomer.setToken(token);
    savedCustomer.setAccessToken(token);
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

    driver.setPassword(passwordEncoder.encode(driver.getPassword()));
    Driver savedDriver = driverRepository.save(driver);

    String token = jwtService.generateToken(
        savedDriver.getDriverId(),
        savedDriver.getDriverEmail() != null ? savedDriver.getDriverEmail() : savedDriver.getDriverName(),
        "DRIVER"
    );

    savedDriver.setPassword(null);
    savedDriver.setToken(token);
    savedDriver.setAccessToken(token);
    return ResponseEntity.ok(savedDriver);
  }
}

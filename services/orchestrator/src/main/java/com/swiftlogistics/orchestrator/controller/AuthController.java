package com.swiftlogistics.orchestrator.controller;

import com.swiftlogistics.orchestrator.dto.CustomerSignUpRequest;
import com.swiftlogistics.orchestrator.dto.DriverSignUpRequest;
import com.swiftlogistics.orchestrator.dto.LoginRequest;
import com.swiftlogistics.orchestrator.model.Customer;
import com.swiftlogistics.orchestrator.model.Driver;
import com.swiftlogistics.orchestrator.repository.CustomerRepository;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import com.swiftlogistics.orchestrator.security.AccessGuard;
import com.swiftlogistics.orchestrator.security.JwtService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

  static final String INVALID_CREDENTIALS = "Invalid credentials";

  private final CustomerRepository customerRepository;
  private final DriverRepository driverRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  private volatile String timingDecoyHash;

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

  /** Burns a BCrypt comparison so unknown accounts cost the same as wrong passwords. */
  private void spendDecoyComparison(String rawPassword) {
    String decoy = timingDecoyHash;
    if (decoy == null) {
      decoy = passwordEncoder.encode(UUID.randomUUID().toString());
      timingDecoyHash = decoy;
    }
    passwordEncoder.matches(rawPassword, decoy);
  }

  private static ResponseStatusException badRequest(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  private static ResponseStatusException invalidCredentials() {
    return new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS);
  }

  private static void requireCredentials(LoginRequest loginRequest) {
    if (loginRequest == null
        || loginRequest.getUsername() == null || loginRequest.getUsername().isBlank()
        || loginRequest.getPassword() == null || loginRequest.getPassword().isEmpty()) {
      throw badRequest("Username and password are required");
    }
  }

  private static String normalizeEmail(String email) {
    return email == null || email.isBlank() ? null : email.trim().toLowerCase(Locale.ROOT);
  }

  private Customer findCustomerByLogin(String username) {
    Customer customer = customerRepository.findCustomerByCustomerName(username);
    if (customer == null) {
      customer = customerRepository.findCustomerByCustomerEmail(username);
    }
    if (customer == null && !username.equals(username.toLowerCase(Locale.ROOT))) {
      customer = customerRepository.findCustomerByCustomerEmail(username.toLowerCase(Locale.ROOT));
    }
    return customer;
  }

  private Driver findDriverByLogin(String username) {
    Driver driver = driverRepository.findDriverByDriverName(username);
    if (driver == null) {
      driver = driverRepository.findDriverByDriverEmail(username);
    }
    if (driver == null) {
      driver = driverRepository.findDriverByName(username);
    }
    if (driver == null) {
      driver = driverRepository.findById(username).orElse(null);
    }
    return driver;
  }

  @PostMapping("/customer")
  public ResponseEntity<Customer> login(@RequestBody LoginRequest loginRequest) {
    requireCredentials(loginRequest);
    String username = loginRequest.getUsername().trim();
    Customer customer = findCustomerByLogin(username);
    if (customer == null) {
      spendDecoyComparison(loginRequest.getPassword());
      throw invalidCredentials();
    }
    if (!verifyPassword(loginRequest.getPassword(), customer.getPassword())) {
      throw invalidCredentials();
    }

    // Upgrade legacy plain-text password to BCrypt hash transparently
    if (!customer.getPassword().startsWith("$2")) {
      customer.setPassword(passwordEncoder.encode(loginRequest.getPassword()));
      customerRepository.save(customer);
    }

    String token = jwtService.generateToken(
        customer.getCustomerId(),
        customer.getCustomerEmail() != null ? customer.getCustomerEmail() : customer.getCustomerName(),
        AccessGuard.ROLE_CUSTOMER
    );

    customer.setPassword(null);
    customer.setToken(token);
    customer.setAccessToken(token);
    return ResponseEntity.ok(customer);
  }

  @PostMapping("/driver")
  public ResponseEntity<Driver> driverLogin(@RequestBody LoginRequest loginRequest) {
    requireCredentials(loginRequest);
    String username = loginRequest.getUsername().trim();
    Driver driver = findDriverByLogin(username);
    if (driver == null) {
      spendDecoyComparison(loginRequest.getPassword());
      throw invalidCredentials();
    }
    if (!verifyPassword(loginRequest.getPassword(), driver.getPassword())) {
      throw invalidCredentials();
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
        AccessGuard.ROLE_DRIVER
    );

    driver.setPassword(null);
    driver.setToken(token);
    driver.setAccessToken(token);
    return ResponseEntity.ok(driver);
  }

  @PostMapping("/driver-logout")
  public ResponseEntity<Map<String, String>> driverLogout(@RequestBody(required = false) LoginRequest loginRequest) {
    if (loginRequest != null && loginRequest.getUsername() != null) {
      Driver driver = findDriverByLogin(loginRequest.getUsername().trim());
      if (driver != null) {
        driver.setAvailable(false);
        driverRepository.save(driver);
      }
    }
    return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
  }

  @PostMapping("/sign-up")
  public ResponseEntity<Customer> signUp(@Valid @RequestBody CustomerSignUpRequest request) {
    String name = request.getCustomerName().trim();
    String email = normalizeEmail(request.getCustomerEmail());
    if (name.isEmpty()) {
      throw badRequest("Customer name is required");
    }
    if (customerIdentityTaken(name, email)) {
      throw badRequest("Customer already exists");
    }

    Customer customer = Customer.builder()
        .customerId(UUID.randomUUID().toString())
        .customerName(name)
        .customerEmail(email)
        .phone(request.getPhone() == null || request.getPhone().isBlank() ? null : request.getPhone().trim())
        .password(passwordEncoder.encode(request.getPassword()))
        .createdAt(LocalDateTime.now())
        .updatedAt(LocalDateTime.now())
        .build();
    Customer savedCustomer = customerRepository.insert(customer);

    String token = jwtService.generateToken(
        savedCustomer.getCustomerId(),
        savedCustomer.getCustomerEmail() != null ? savedCustomer.getCustomerEmail() : savedCustomer.getCustomerName(),
        AccessGuard.ROLE_CUSTOMER
    );

    savedCustomer.setPassword(null);
    savedCustomer.setToken(token);
    savedCustomer.setAccessToken(token);
    return ResponseEntity.ok(savedCustomer);
  }

  @PostMapping("/driver-sign-up")
  public ResponseEntity<Driver> driverSignUp(@Valid @RequestBody DriverSignUpRequest request) {
    String driverName = request.getDriverName().trim();
    String email = normalizeEmail(request.getDriverEmail());
    String displayName = request.getName() == null || request.getName().isBlank()
        ? driverName : request.getName().trim();
    if (driverName.isEmpty()) {
      throw badRequest("Driver name is required");
    }
    if (driverIdentityTaken(driverName, email, displayName)) {
      throw badRequest("Driver already exists");
    }

    String vehicleId = request.getVehicleId().trim();
    Driver driver = Driver.builder()
        .driverId(UUID.randomUUID().toString())
        .driverName(driverName)
        .driverEmail(email)
        .name(displayName)
        .vehicleId(vehicleId)
        .vehicleNumber(vehicleId)
        .type(request.getType() == null || request.getType().isBlank() ? null : request.getType().trim())
        .password(passwordEncoder.encode(request.getPassword()))
        .isAvailable(false)
        .build();
    Driver savedDriver = driverRepository.insert(driver);

    String token = jwtService.generateToken(
        savedDriver.getDriverId(),
        savedDriver.getDriverEmail() != null ? savedDriver.getDriverEmail() : savedDriver.getDriverName(),
        AccessGuard.ROLE_DRIVER
    );

    savedDriver.setPassword(null);
    savedDriver.setToken(token);
    savedDriver.setAccessToken(token);
    return ResponseEntity.ok(savedDriver);
  }

  /**
   * Login resolves a username by name first and then by email, so a new name must not equal an
   * existing email (and vice versa), otherwise it could shadow another account's login.
   */
  private boolean customerIdentityTaken(String name, String email) {
    if (customerRepository.findCustomerByCustomerName(name) != null
        || customerRepository.findCustomerByCustomerEmail(name) != null) {
      return true;
    }
    return email != null
        && (customerRepository.findCustomerByCustomerEmail(email) != null
        || customerRepository.findCustomerByCustomerName(email) != null);
  }

  /** Driver login also resolves by display name and by id, so those identifiers must stay unique too. */
  private boolean driverIdentityTaken(String driverName, String email, String displayName) {
    if (driverRepository.findDriverByDriverName(driverName) != null
        || driverRepository.findDriverByDriverEmail(driverName) != null
        || driverRepository.findDriverByName(driverName) != null
        || driverRepository.existsById(driverName)) {
      return true;
    }
    if (email != null
        && (driverRepository.findDriverByDriverEmail(email) != null
        || driverRepository.findDriverByDriverName(email) != null
        || driverRepository.existsById(email))) {
      return true;
    }
    return driverRepository.findDriverByName(displayName) != null
        || driverRepository.findDriverByDriverName(displayName) != null;
  }
}

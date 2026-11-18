package com.swiftlogistics.orchestrator;

import com.swiftlogistics.orchestrator.controller.AuthController;
import com.swiftlogistics.orchestrator.dto.CustomerSignUpRequest;
import com.swiftlogistics.orchestrator.dto.DriverSignUpRequest;
import com.swiftlogistics.orchestrator.dto.LoginRequest;
import com.swiftlogistics.orchestrator.model.Customer;
import com.swiftlogistics.orchestrator.model.Driver;
import com.swiftlogistics.orchestrator.repository.CustomerRepository;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import com.swiftlogistics.orchestrator.security.JwtService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AuthControllerTest {

    private CustomerRepository customers;
    private DriverRepository drivers;
    private PasswordEncoder encoder;
    private JwtService jwt;
    private AuthController controller;

    @BeforeEach
    void setUp() {
        customers = mock(CustomerRepository.class);
        drivers = mock(DriverRepository.class);
        encoder = new BCryptPasswordEncoder(4);
        jwt = new JwtService("swift-logistics-test-signing-key-2026", 60_000);
        controller = new AuthController(customers, drivers, encoder, jwt);
    }

    private static CustomerSignUpRequest customerRequest(String name, String email) {
        return CustomerSignUpRequest.builder()
                .customerName(name).customerEmail(email).password("secret123").build();
    }

    @Test
    void customerSignUpGeneratesIdAndNeverReplacesAnExistingAccount() {
        AtomicReference<String> storedHash = new AtomicReference<>();
        when(customers.insert(any(Customer.class))).thenAnswer(inv -> {
            Customer toStore = inv.getArgument(0);
            storedHash.set(toStore.getPassword());
            return toStore;
        });

        ResponseEntity<Customer> response = controller.signUp(customerRequest("Eve", "Eve@Example.com"));

        ArgumentCaptor<Customer> saved = ArgumentCaptor.forClass(Customer.class);
        verify(customers).insert(saved.capture());
        verify(customers, never()).save(any());
        assertNotNull(saved.getValue().getCustomerId());
        assertNotEquals("cust-001", saved.getValue().getCustomerId());
        assertEquals("eve@example.com", saved.getValue().getCustomerEmail());
        assertNotEquals("secret123", storedHash.get());
        assertTrue(encoder.matches("secret123", storedHash.get()));

        Customer body = response.getBody();
        assertNotNull(body);
        assertNull(body.getPassword());
        Claims claims = jwt.validateAndExtractClaims(body.getToken());
        assertEquals(saved.getValue().getCustomerId(), claims.getSubject());
        assertEquals("CUSTOMER", claims.get("role", String.class));
    }

    @Test
    void customerSignUpRejectsDuplicateName() {
        when(customers.findCustomerByCustomerName("Apex Electronics Colombo")).thenReturn(new Customer());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.signUp(customerRequest("Apex Electronics Colombo", "new@example.com")));

        assertEquals(400, ex.getStatusCode().value());
        verify(customers, never()).insert(any(Customer.class));
    }

    @Test
    void customerSignUpRejectsDuplicateEmail() {
        when(customers.findCustomerByCustomerEmail("client@swift.lk")).thenReturn(new Customer());

        assertThrows(ResponseStatusException.class,
                () -> controller.signUp(customerRequest("Someone New", "Client@Swift.lk")));
        verify(customers, never()).insert(any(Customer.class));
    }

    @Test
    void customerSignUpRejectsNameThatShadowsAnotherAccountsEmailLogin() {
        when(customers.findCustomerByCustomerEmail("client@swift.lk")).thenReturn(new Customer());

        assertThrows(ResponseStatusException.class,
                () -> controller.signUp(customerRequest("client@swift.lk", "attacker@example.com")));
        verify(customers, never()).insert(any(Customer.class));
    }

    @Test
    void driverSignUpIgnoresClientSuppliedIdentityAndRejectsIdCollisions() {
        when(drivers.existsById("driver-001")).thenReturn(true);
        DriverSignUpRequest collision = DriverSignUpRequest.builder()
                .driverName("driver-001").password("secret123").vehicleId("WP CAB-1").build();
        assertThrows(ResponseStatusException.class, () -> controller.driverSignUp(collision));

        when(drivers.insert(any(Driver.class))).thenAnswer(inv -> inv.getArgument(0));
        DriverSignUpRequest ok = DriverSignUpRequest.builder()
                .driverName("new.driver").password("secret123").vehicleId("WP CAB-9").type("VAN").build();
        Driver body = controller.driverSignUp(ok).getBody();

        assertNotNull(body);
        assertNotNull(body.getDriverId());
        assertFalse(body.isAvailable());
        assertNull(body.getPassword());
        assertEquals("DRIVER", jwt.validateAndExtractClaims(body.getToken()).get("role", String.class));
        verify(drivers, never()).save(any());
    }

    @Test
    void loginFailuresAreIndistinguishableForUnknownUserAndWrongPassword() {
        Customer existing = Customer.builder()
                .customerId("cust-1").customerName("Known").password(encoder.encode("right-password")).build();
        when(customers.findCustomerByCustomerName("Known")).thenReturn(existing);

        ResponseStatusException unknown = assertThrows(ResponseStatusException.class,
                () -> controller.login(new LoginRequest("Nobody", "whatever")));
        ResponseStatusException wrong = assertThrows(ResponseStatusException.class,
                () -> controller.login(new LoginRequest("Known", "wrong-password")));

        assertEquals(401, unknown.getStatusCode().value());
        assertEquals(401, wrong.getStatusCode().value());
        assertEquals("Invalid credentials", unknown.getReason());
        assertEquals(unknown.getReason(), wrong.getReason());
    }

    @Test
    void loginIssuesCustomerTokenForValidCredentials() {
        Customer existing = Customer.builder()
                .customerId("cust-1").customerName("Known").customerEmail("known@example.com")
                .password(encoder.encode("right-password")).build();
        when(customers.findCustomerByCustomerName("Known")).thenReturn(existing);

        Customer body = controller.login(new LoginRequest("Known", "right-password")).getBody();

        assertNotNull(body);
        assertNull(body.getPassword());
        Claims claims = jwt.validateAndExtractClaims(body.getToken());
        assertEquals("cust-1", claims.getSubject());
        assertEquals("CUSTOMER", claims.get("role", String.class));
    }

    @Test
    void loginRequiresBothFields() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.login(new LoginRequest("Known", "")));
        assertEquals(400, ex.getStatusCode().value());
    }
}

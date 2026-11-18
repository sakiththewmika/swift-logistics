package com.swiftlogistics.orchestrator;

import com.swiftlogistics.orchestrator.config.ApiExceptionHandler;
import com.swiftlogistics.orchestrator.controller.DriverController;
import com.swiftlogistics.orchestrator.controller.OrderController;
import com.swiftlogistics.orchestrator.controller.RecoveryController;
import com.swiftlogistics.orchestrator.model.IdempotencyRecord;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.repository.IdempotencyRecordRepository;
import com.swiftlogistics.orchestrator.security.JwtAuthenticationFilter;
import com.swiftlogistics.orchestrator.security.JwtService;
import com.swiftlogistics.orchestrator.service.DriverService;
import com.swiftlogistics.orchestrator.service.EventService;
import com.swiftlogistics.orchestrator.service.OrderService;
import com.swiftlogistics.orchestrator.service.RecoveryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Exercises the real JWT filter, role/ownership guards, validation and JSON error
 * rendering together through MockMvc.
 */
class SecurityEnforcementTest {

    private JwtService jwt;
    private JwtAuthenticationFilter filter;
    private OrderService orderService;
    private DriverService driverService;
    private RecoveryService recoveryService;
    private IdempotencyRecordRepository idempotency;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        jwt = new JwtService("swift-logistics-test-signing-key-2026", 60_000);
        filter = new JwtAuthenticationFilter(jwt);
        ReflectionTestUtils.setField(filter, "requireJwt", true);

        orderService = mock(OrderService.class);
        driverService = mock(DriverService.class);
        recoveryService = mock(RecoveryService.class);
        idempotency = mock(IdempotencyRecordRepository.class);

        mvc = MockMvcBuilders.standaloneSetup(
                        new OrderController(orderService, mock(EventService.class), idempotency),
                        new DriverController(driverService),
                        new RecoveryController(recoveryService))
                .setControllerAdvice(new ApiExceptionHandler())
                .addFilters(filter)
                .build();
    }

    private String bearer(String userId, String role) {
        return "Bearer " + jwt.generateToken(userId, userId + "@example.com", role);
    }

    private static MockHttpServletRequestBuilder at(MockHttpServletRequestBuilder builder, String path) {
        // The filter inspects the servlet path, which MockMvc leaves empty unless set explicitly.
        return builder.servletPath(path);
    }

    private static final String VALID_ORDER = """
            {"customerId":"cust-1","deliveryAddress":"42 Galle Road","city":"Colombo",
             "postalCode":"00300","country":"Sri Lanka","totalAmount":18500}""";

    // ----- filter -----

    @Test
    void protectedRoutesRejectMissingTokenWithJsonMessage() throws Exception {
        mvc.perform(at(get("/api/v1/orders/customer/cust-1"), "/api/v1/orders/customer/cust-1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication required"));
    }

    @Test
    void recoveryRouteIsProtectedToo() throws Exception {
        mvc.perform(at(post("/api/v1/recovery/replay").param("queue", "order-created.dlq"),
                        "/api/v1/recovery/replay"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void forgedTokenIsRejected() throws Exception {
        mvc.perform(at(get("/api/v1/orders/customer/cust-1").header("Authorization", "Bearer abc.def.ghi"),
                        "/api/v1/orders/customer/cust-1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid or expired token"));
    }

    @Test
    void sseWebSocketAuthAndHealthStayOpenWithoutAToken() throws Exception {
        for (String path : List.of("/sse/order/o-1", "/ws", "/ws/info", "/api/v1/auth/customer",
                "/api/v1/orders/health", "/swagger-ui/index.html", "/actuator/health")) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
            request.setServletPath(path);
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();

            filter.doFilter(request, response, chain);

            assertNotNull(chain.getRequest(), path + " should reach the application");
            assertNotEquals(401, response.getStatus(), path);
        }
    }

    // ----- ownership & roles -----

    @Test
    void customerCanListOwnOrdersButNotSomeoneElses() throws Exception {
        when(orderService.getOrdersByCustomer("cust-1")).thenReturn(List.of());

        mvc.perform(at(get("/api/v1/orders/customer/cust-1").header("Authorization", bearer("cust-1", "CUSTOMER")),
                        "/api/v1/orders/customer/cust-1"))
                .andExpect(status().isOk());
        mvc.perform(at(get("/api/v1/orders/customer/cust-2").header("Authorization", bearer("cust-1", "CUSTOMER")),
                        "/api/v1/orders/customer/cust-2"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void orderLookupIsLimitedToItsCustomerAndAssignedDriver() throws Exception {
        Order order = Order.builder().orderId("o-1").customerId("cust-1").driverId("drv-1").build();
        when(orderService.getOrder("o-1")).thenReturn(Optional.of(order));
        String path = "/api/v1/orders/o-1";

        mvc.perform(at(get(path).header("Authorization", bearer("cust-1", "CUSTOMER")), path))
                .andExpect(status().isOk());
        mvc.perform(at(get(path).header("Authorization", bearer("drv-1", "DRIVER")), path))
                .andExpect(status().isOk());
        mvc.perform(at(get(path).header("Authorization", bearer("cust-2", "CUSTOMER")), path))
                .andExpect(status().isForbidden());
        mvc.perform(at(get(path).header("Authorization", bearer("drv-2", "DRIVER")), path))
                .andExpect(status().isForbidden());
    }

    @Test
    void customerCannotCreateOrdersOnBehalfOfAnotherCustomer() throws Exception {
        mvc.perform(at(post("/api/v1/orders").header("Authorization", bearer("cust-2", "CUSTOMER"))
                        .header("Idempotency-Key", "k-1").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER), "/api/v1/orders"))
                .andExpect(status().isForbidden());
    }

    @Test
    void driverTokenCannotCreateOrders() throws Exception {
        mvc.perform(at(post("/api/v1/orders").header("Authorization", bearer("cust-1", "DRIVER"))
                        .header("Idempotency-Key", "k-1").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER), "/api/v1/orders"))
                .andExpect(status().isForbidden());
    }

    @Test
    void customerCanCreateOwnOrder() throws Exception {
        Order created = Order.builder().orderId("o-9").customerId("cust-1").build();
        when(orderService.createOrder(any())).thenReturn(created);

        mvc.perform(at(post("/api/v1/orders").header("Authorization", bearer("cust-1", "CUSTOMER"))
                        .header("Idempotency-Key", "k-1").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER), "/api/v1/orders"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderId").value("o-9"));
    }

    @Test
    void idempotencyKeyCannotBeUsedToReadAnotherCustomersOrder() throws Exception {
        when(idempotency.insert(any(IdempotencyRecord.class)))
                .thenThrow(new org.springframework.dao.DuplicateKeyException("dup"));
        when(idempotency.findById("shared-key"))
                .thenReturn(Optional.of(new IdempotencyRecord("shared-key", "o-1", java.time.Instant.now())));
        when(orderService.getOrder("o-1"))
                .thenReturn(Optional.of(Order.builder().orderId("o-1").customerId("cust-1").build()));

        mvc.perform(at(post("/api/v1/orders").header("Authorization", bearer("cust-2", "CUSTOMER"))
                        .header("Idempotency-Key", "shared-key").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace("cust-1", "cust-2")), "/api/v1/orders"))
                .andExpect(status().isForbidden());
    }

    @Test
    void recoveryReplayAllowsCustomersAndAdminsButNotDrivers() throws Exception {
        when(recoveryService.replay(anyString(), anyInt())).thenReturn(2);
        String path = "/api/v1/recovery/replay";

        mvc.perform(at(post(path).param("queue", "order-created.dlq")
                        .header("Authorization", bearer("cust-1", "CUSTOMER")), path))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(2));
        mvc.perform(at(post(path).param("queue", "order-created.dlq")
                        .header("Authorization", bearer("admin-1", "ADMIN")), path))
                .andExpect(status().isOk());
        mvc.perform(at(post(path).param("queue", "order-created.dlq")
                        .header("Authorization", bearer("drv-1", "DRIVER")), path))
                .andExpect(status().isForbidden());
        mvc.perform(at(post(path).param("queue", "order-created.dlq").param("limit", "100000")
                        .header("Authorization", bearer("cust-1", "CUSTOMER")), path))
                .andExpect(status().isBadRequest());
    }

    @Test
    void driverEndpointsAreRestrictedToTheDriverThemself() throws Exception {
        when(driverService.getPendingOrdersForDriver("drv-1")).thenReturn(List.of());
        String own = "/api/v1/drivers/driver/drv-1";
        String other = "/api/v1/drivers/driver/drv-2";

        mvc.perform(at(get(own).header("Authorization", bearer("drv-1", "DRIVER")), own))
                .andExpect(status().isOk());
        mvc.perform(at(get(other).header("Authorization", bearer("drv-1", "DRIVER")), other))
                .andExpect(status().isForbidden());
        mvc.perform(at(get(own).header("Authorization", bearer("cust-1", "CUSTOMER")), own))
                .andExpect(status().isForbidden());
    }

    // ----- validation -----

    @Test
    void createOrderRejectsNonPositiveAmountWithJsonMessage() throws Exception {
        mvc.perform(at(post("/api/v1/orders").header("Authorization", bearer("cust-1", "CUSTOMER"))
                        .header("Idempotency-Key", "k-2").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace("18500", "-5")), "/api/v1/orders"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("totalAmount must be greater than 0"))
                .andExpect(jsonPath("$.errors.totalAmount").exists());
    }

    @Test
    void createOrderRejectsBlankAddressAndMissingAmount() throws Exception {
        mvc.perform(at(post("/api/v1/orders").header("Authorization", bearer("cust-1", "CUSTOMER"))
                        .header("Idempotency-Key", "k-3").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":\"cust-1\",\"deliveryAddress\":\"  \"}"), "/api/v1/orders"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.deliveryAddress").exists())
                .andExpect(jsonPath("$.errors.totalAmount").exists());
    }

    @Test
    void malformedJsonReturnsJsonBadRequest() throws Exception {
        mvc.perform(at(post("/api/v1/orders").header("Authorization", bearer("cust-1", "CUSTOMER"))
                        .header("Idempotency-Key", "k-4").contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"), "/api/v1/orders"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void oversizedProofOfDeliveryImageIsRejectedAsBadRequest() throws Exception {
        String path = "/api/v1/drivers/driver/drv-1/orders/o-1/pod";
        String huge = "A".repeat(2_000_001);

        mvc.perform(at(post(path).header("Authorization", bearer("drv-1", "DRIVER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DELIVERED\",\"signatureData\":\"" + huge + "\"}"), path))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.signatureData").exists());
    }

    @Test
    void proofOfDeliveryRejectsUnknownStatus() throws Exception {
        String path = "/api/v1/drivers/driver/drv-1/orders/o-1/pod";

        mvc.perform(at(post(path).header("Authorization", bearer("drv-1", "DRIVER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"MAYBE\"}"), path))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.status").exists());
    }

    @Test
    void driverCannotSubmitProofForAnotherDriversPath() throws Exception {
        String path = "/api/v1/drivers/driver/drv-2/orders/o-1/pod";

        mvc.perform(at(post(path).header("Authorization", bearer("drv-1", "DRIVER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DELIVERED\"}"), path))
                .andExpect(status().isForbidden());
    }
}

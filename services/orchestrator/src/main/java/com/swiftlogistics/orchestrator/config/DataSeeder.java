package com.swiftlogistics.orchestrator.config;

import com.swiftlogistics.orchestrator.model.Customer;
import com.swiftlogistics.orchestrator.model.Driver;
import com.swiftlogistics.orchestrator.model.Event;
import com.swiftlogistics.orchestrator.model.Order;
import com.swiftlogistics.orchestrator.model.Route;
import com.swiftlogistics.orchestrator.model.enums.EventSource;
import com.swiftlogistics.orchestrator.model.enums.EventStatus;
import com.swiftlogistics.orchestrator.model.enums.EventType;
import com.swiftlogistics.orchestrator.model.enums.OrderStatus;
import com.swiftlogistics.orchestrator.repository.CustomerRepository;
import com.swiftlogistics.orchestrator.repository.DriverRepository;
import com.swiftlogistics.orchestrator.repository.EventRepository;
import com.swiftlogistics.orchestrator.repository.OrderRepository;
import com.swiftlogistics.orchestrator.repository.RouteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Idempotent Database Seeder for Swift Logistics Orchestrator.
 * Populates MongoDB with demo customers, drivers, sample orders, and audit events on startup
 * if the database has not yet been seeded.
 */
@Component
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements CommandLineRunner {

    private final CustomerRepository customerRepository;
    private final DriverRepository driverRepository;
    private final OrderRepository orderRepository;
    private final EventRepository eventRepository;
    private final RouteRepository routeRepository;

    @Override
    public void run(String... args) {
        if (customerRepository.count() > 0) {
            log.info("Database already contains customer data. Skipping DataSeeder.");
            return;
        }

        log.info("Seeding demo customers, drivers, sample orders, and audit events...");

        // 1. Seed Demo Customers
        Customer customer1 = Customer.builder()
                .customerId("cust-001")
                .customerName("Apex Electronics Colombo")
                .customerEmail("client@swift.lk")
                .password("password123")
                .phone("+94112345678")
                .createdAt(LocalDateTime.now().minusDays(5))
                .updatedAt(LocalDateTime.now().minusDays(5))
                .build();

        Customer customer2 = Customer.builder()
                .customerId("cust-002")
                .customerName("Ceylon Retail Hub")
                .customerEmail("merchant@swift.lk")
                .password("password123")
                .phone("+94119876543")
                .createdAt(LocalDateTime.now().minusDays(5))
                .updatedAt(LocalDateTime.now().minusDays(5))
                .build();

        customerRepository.saveAll(List.of(customer1, customer2));
        log.info("Seeded 2 demo customers: client@swift.lk, merchant@swift.lk");

        // 2. Seed Demo Drivers
        Driver driver1 = Driver.builder()
                .driverId("driver-001")
                .driverName("driver1@swift.lk")
                .driverEmail("driver1@swift.lk")
                .name("Kasun Perera")
                .vehicleId("WP CAB-4521")
                .vehicleNumber("WP CAB-4521")
                .currentLocation("Colombo 03")
                .status("AVAILABLE")
                .isAvailable(true)
                .type("VAN")
                .password("password123")
                .build();

        Driver driver2 = Driver.builder()
                .driverId("driver-002")
                .driverName("driver2@swift.lk")
                .driverEmail("driver2@swift.lk")
                .name("Nuwan Silva")
                .vehicleId("WP DAC-8810")
                .vehicleNumber("WP DAC-8810")
                .currentLocation("Dehiwala")
                .status("BUSY")
                .isAvailable(false)
                .type("MOTORCYCLE")
                .password("password123")
                .build();

        driverRepository.saveAll(List.of(driver1, driver2));
        log.info("Seeded 2 demo drivers: driver1@swift.lk (Kasun Perera), driver2@swift.lk (Nuwan Silva)");

        // 3. Seed Sample Routes
        Route route1 = Route.builder()
                .routeId("RT-COL-001")
                .waypoints(List.of(
                        "Central Sorting Hub, Colombo 10",
                        "Union Place, Colombo 02",
                        "42 Galle Road, Kollupitiya, Colombo 03"
                ))
                .createdAt(LocalDateTime.now().minusDays(2))
                .build();

        Route route2 = Route.builder()
                .routeId("RT-COL-002")
                .waypoints(List.of(
                        "Central Sorting Hub, Colombo 10",
                        "Kollupitiya Junction",
                        "15 Alfred House Gardens, Bambalapitiya, Colombo 04"
                ))
                .createdAt(LocalDateTime.now().minusHours(2))
                .build();

        routeRepository.saveAll(List.of(route1, route2));

        // 4. Seed Sample Orders
        LocalDateTime now = LocalDateTime.now();

        // Order 1: DELIVERED
        LocalDateTime t1Created = now.minusDays(2);
        LocalDateTime t1Billed = t1Created.plusMinutes(15);
        LocalDateTime t1PackageReady = t1Created.plusMinutes(45);
        LocalDateTime t1Routed = t1Created.plusHours(1);
        LocalDateTime t1PickedUp = t1Created.plusHours(2);
        LocalDateTime t1Delivered = t1Created.plusHours(3);

        Order order1 = Order.builder()
                .orderId("ORD-COL-1001")
                .customerId(customer1.getCustomerId())
                .deliveryAddress("42 Galle Road, Kollupitiya")
                .city("Colombo 03")
                .postalCode("00300")
                .country("Sri Lanka")
                .status(OrderStatus.DELIVERED)
                .driverId(driver1.getDriverId())
                .vehicleId(driver1.getVehicleId())
                .routeId(route1.getRouteId())
                .totalAmount(15400.0)
                .billingStatus("PAID")
                .deliveryNotes("Fragile electronics delivered to reception desk.")
                .proofOfDeliverySignature("data:image/svg+xml;utf8,<svg>Kasun</svg>")
                .createdAt(t1Created)
                .billedAt(t1Billed)
                .packageReadyAt(t1PackageReady)
                .routedAt(t1Routed)
                .pickedUpAt(t1PickedUp)
                .deliveredAt(t1Delivered)
                .updatedAt(t1Delivered)
                .build();

        // Order 2: ROUTED / DISPATCHED
        LocalDateTime t2Created = now.minusHours(3);
        LocalDateTime t2Billed = t2Created.plusMinutes(10);
        LocalDateTime t2PackageReady = t2Created.plusMinutes(35);
        LocalDateTime t2Routed = t2Created.plusHours(1);

        Order order2 = Order.builder()
                .orderId("ORD-COL-1002")
                .customerId(customer1.getCustomerId())
                .deliveryAddress("15 Alfred House Gardens, Bambalapitiya")
                .city("Colombo 04")
                .postalCode("00400")
                .country("Sri Lanka")
                .status(OrderStatus.ROUTED)
                .driverId(driver1.getDriverId())
                .vehicleId(driver1.getVehicleId())
                .routeId(route2.getRouteId())
                .totalAmount(28750.0)
                .billingStatus("PAID")
                .deliveryNotes("Urgent commercial shipment - priority delivery.")
                .createdAt(t2Created)
                .billedAt(t2Billed)
                .packageReadyAt(t2PackageReady)
                .routedAt(t2Routed)
                .updatedAt(t2Routed)
                .build();

        // Order 3: BILLED
        LocalDateTime t3Created = now.minusMinutes(45);
        LocalDateTime t3Billed = t3Created.plusMinutes(12);

        Order order3 = Order.builder()
                .orderId("ORD-COL-1003")
                .customerId(customer1.getCustomerId())
                .deliveryAddress("88 Havelock Road, Havelock Town")
                .city("Colombo 05")
                .postalCode("00500")
                .country("Sri Lanka")
                .status(OrderStatus.BILLED)
                .totalAmount(8900.0)
                .billingStatus("PAID")
                .deliveryNotes("Standard delivery window: 9 AM - 5 PM")
                .createdAt(t3Created)
                .billedAt(t3Billed)
                .updatedAt(t3Billed)
                .build();

        orderRepository.saveAll(List.of(order1, order2, order3));
        log.info("Seeded 3 sample orders: ORD-COL-1001 (DELIVERED), ORD-COL-1002 (ROUTED), ORD-COL-1003 (BILLED)");

        // 5. Seed Audit Events
        List<Event> events = List.of(
                // Order 1 Audit Events
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.ORDER_CREATED).source(EventSource.CLIENT_PORTAL)
                        .status(EventStatus.SUCCESS).description("Order placed by Apex Electronics Colombo")
                        .timestamp(t1Created).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.ORDER_SENT_TO_CMS).source(EventSource.ORCHESTRATOR)
                        .status(EventStatus.SUCCESS).description("Order forwarded to CMS for payment verification")
                        .timestamp(t1Created.plusMinutes(2)).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.BILLING_COMPLETED).source(EventSource.CMS_ADAPTER)
                        .status(EventStatus.SUCCESS).description("Payment of LKR 15,400.00 confirmed and billed")
                        .timestamp(t1Billed).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.ORDER_SENT_TO_WMS).source(EventSource.ORCHESTRATOR)
                        .status(EventSource.ORCHESTRATOR != null ? EventStatus.SUCCESS : null)
                        .description("Order transmitted to WMS for warehouse fulfillment")
                        .timestamp(t1Billed.plusMinutes(5)).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.PACKAGE_READY).source(EventSource.WMS_ADAPTER)
                        .status(EventStatus.SUCCESS).description("Package picked, verified, and sealed in sorting bay A")
                        .timestamp(t1PackageReady).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.ROUTE_CREATED).source(EventSource.ROS_ADAPTER)
                        .status(EventStatus.SUCCESS).description("Route RT-COL-001 optimized and assigned")
                        .timestamp(t1Routed).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.DRIVER_ASSIGNED).source(EventSource.ORCHESTRATOR)
                        .status(EventStatus.SUCCESS).description("Assigned to Driver Kasun Perera (WP CAB-4521)")
                        .timestamp(t1Routed.plusMinutes(2)).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.DELIVERY_STARTED).source(EventSource.DRIVER_APP)
                        .status(EventStatus.SUCCESS).description("Driver Kasun Perera picked up package and started transit")
                        .timestamp(t1PickedUp).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order1.getOrderId())
                        .eventType(EventType.DELIVERY_COMPLETED).source(EventSource.DRIVER_APP)
                        .status(EventStatus.SUCCESS).description("Package successfully delivered with recipient signature")
                        .timestamp(t1Delivered).build(),

                // Order 2 Audit Events
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order2.getOrderId())
                        .eventType(EventType.ORDER_CREATED).source(EventSource.CLIENT_PORTAL)
                        .status(EventStatus.SUCCESS).description("Order placed by Apex Electronics Colombo")
                        .timestamp(t2Created).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order2.getOrderId())
                        .eventType(EventType.ORDER_SENT_TO_CMS).source(EventSource.ORCHESTRATOR)
                        .status(EventStatus.SUCCESS).description("Billing instruction sent to CMS")
                        .timestamp(t2Created.plusMinutes(2)).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order2.getOrderId())
                        .eventType(EventType.BILLING_COMPLETED).source(EventSource.CMS_ADAPTER)
                        .status(EventStatus.SUCCESS).description("Payment of LKR 28,750.00 confirmed")
                        .timestamp(t2Billed).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order2.getOrderId())
                        .eventType(EventType.ORDER_SENT_TO_WMS).source(EventSource.ORCHESTRATOR)
                        .status(EventStatus.SUCCESS).description("Order queued in warehouse management system")
                        .timestamp(t2Billed.plusMinutes(5)).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order2.getOrderId())
                        .eventType(EventType.PACKAGE_READY).source(EventSource.WMS_ADAPTER)
                        .status(EventStatus.SUCCESS).description("Package staged in bay B-4 for dispatch")
                        .timestamp(t2PackageReady).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order2.getOrderId())
                        .eventType(EventType.ROUTE_CREATED).source(EventSource.ROS_ADAPTER)
                        .status(EventStatus.SUCCESS).description("Route RT-COL-002 calculated via Bambalapitiya")
                        .timestamp(t2Routed).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order2.getOrderId())
                        .eventType(EventType.DRIVER_ASSIGNED).source(EventSource.ORCHESTRATOR)
                        .status(EventStatus.SUCCESS).description("Driver Kasun Perera dispatched with delivery manifest")
                        .timestamp(t2Routed.plusMinutes(2)).build(),

                // Order 3 Audit Events
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order3.getOrderId())
                        .eventType(EventType.ORDER_CREATED).source(EventSource.CLIENT_PORTAL)
                        .status(EventStatus.SUCCESS).description("Order placed by Apex Electronics Colombo")
                        .timestamp(t3Created).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order3.getOrderId())
                        .eventType(EventType.ORDER_SENT_TO_CMS).source(EventSource.ORCHESTRATOR)
                        .status(EventStatus.SUCCESS).description("Payment authorization dispatched to CMS")
                        .timestamp(t3Created.plusMinutes(2)).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order3.getOrderId())
                        .eventType(EventType.BILLING_COMPLETED).source(EventSource.CMS_ADAPTER)
                        .status(EventStatus.SUCCESS).description("Payment of LKR 8,900.00 settled successfully")
                        .timestamp(t3Billed).build(),
                Event.builder().eventId(UUID.randomUUID().toString()).orderId(order3.getOrderId())
                        .eventType(EventType.ORDER_SENT_TO_WMS).source(EventSource.ORCHESTRATOR)
                        .status(EventStatus.SUCCESS).description("Fulfillment request sent to warehouse")
                        .timestamp(t3Billed.plusMinutes(2)).build()
        );

        eventRepository.saveAll(events);
        log.info("Seeded {} audit events across sample orders", events.size());
        log.info("DataSeeder completed successfully. Demo dataset ready.");
    }
}

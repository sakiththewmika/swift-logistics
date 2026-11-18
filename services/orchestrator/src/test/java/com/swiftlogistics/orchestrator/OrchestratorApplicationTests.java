package com.swiftlogistics.orchestrator;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Boots the whole application context under the hermetic "test" profile, so it needs no database,
 * broker or service registry and can never touch a real environment.
 */
@SpringBootTest
@ActiveProfiles("test")
class OrchestratorApplicationTests {

	@Autowired
	private Environment environment;

	@Test
	void contextLoads() {
	}

	@Test
	void testProfileCannotReachARealDatabaseOrBroker() {
		String mongoUri = environment.getProperty("spring.data.mongodb.uri");
		assertTrue(mongoUri != null && mongoUri.startsWith("mongodb://localhost:1/"), "unexpected Mongo URI: " + mongoUri);
		assertFalse(environment.getProperty("app.seed.enabled", Boolean.class, true), "seeding must be off in tests");
		assertFalse(environment.getProperty("app.outbox.relay.enabled", Boolean.class, true), "outbox relay must be off in tests");
		assertEquals("localhost", environment.getProperty("spring.rabbitmq.host"));
	}
}

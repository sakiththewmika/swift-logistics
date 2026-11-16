package com.swiftlogistics.orchestrator;

import com.swiftlogistics.orchestrator.security.JwtService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private static final String SECRET = "swift-logistics-test-signing-key-2026";

    @Test
    void generatesTokenWithExpectedClaims() {
        JwtService jwtService = new JwtService(SECRET, 60_000);

        Claims claims = jwtService.validateAndExtractClaims(
                jwtService.generateToken("user-1", "user@example.com", "DRIVER"));

        assertEquals("user-1", claims.getSubject());
        assertEquals("user@example.com", claims.get("email", String.class));
        assertEquals("DRIVER", claims.get("role", String.class));
    }

    @Test
    void rejectsTamperedToken() {
        JwtService jwtService = new JwtService(SECRET, 60_000);
        String token = jwtService.generateToken("user-1", "user@example.com", "CUSTOMER");

        assertFalse(jwtService.isTokenValid(token + "tampered"));
    }

    @Test
    void rejectsExpiredToken() {
        JwtService jwtService = new JwtService(SECRET, -1);

        assertFalse(jwtService.isTokenValid(
                jwtService.generateToken("user-1", "user@example.com", "CUSTOMER")));
    }
}

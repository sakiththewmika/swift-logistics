package com.swiftlogistics.orchestrator.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Value("${app.security.require-jwt:false}")
    private boolean requireJwt;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod()) || isOpenPath(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        String authorization = request.getHeader("Authorization");
        String token = extractBearerToken(authorization);
        if (token == null) {
            if (requireJwt && isProtectedPath(request)) {
                writeUnauthorized(response);
                return;
            }
            filterChain.doFilter(request, response);
            return;
        }

        if (!jwtService.isTokenValid(token)) {
            writeUnauthorized(response);
            return;
        }

        Claims claims;
        try {
            claims = jwtService.validateAndExtractClaims(token);
        } catch (RuntimeException exception) {
            writeUnauthorized(response);
            return;
        }
        request.setAttribute("authenticatedUserId", claims.getSubject());
        request.setAttribute("authenticatedEmail", claims.get("email", String.class));
        request.setAttribute("authenticatedRole", claims.get("role", String.class));
        filterChain.doFilter(request, response);
    }

    private String extractBearerToken(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            return null;
        }
        if (!authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return "";
        }
        String token = authorization.substring(7).trim();
        return token.isEmpty() ? "" : token;
    }

    private boolean isOpenPath(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/api/v1/auth/")
                || path.equals("/api/v1/orders/health")
                || path.startsWith("/swagger-ui/")
                || path.equals("/swagger-ui.html")
                || path.startsWith("/v3/api-docs/")
                || path.equals("/v3/api-docs")
                || path.startsWith("/actuator/")
                || path.startsWith("/sse/")
                || path.startsWith("/ws/");
    }

    private boolean isProtectedPath(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/api/v1/orders/")
                || path.equals("/api/v1/orders")
                || path.startsWith("/api/v1/drivers/");
    }

    private void writeUnauthorized(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Invalid or expired JWT token\"}");
    }
}

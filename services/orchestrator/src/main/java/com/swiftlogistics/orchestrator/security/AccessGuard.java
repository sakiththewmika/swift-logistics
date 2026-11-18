package com.swiftlogistics.orchestrator.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.Optional;

/**
 * Role and resource-ownership checks driven by the attributes that
 * {@link JwtAuthenticationFilter} stores on the request after verifying a token.
 *
 * <p>When no authenticated principal is present (only possible when
 * {@code app.security.require-jwt=false}, or outside a web request) the checks are
 * skipped; with enforcement on, the filter rejects such requests before they reach
 * a controller.
 */
public final class AccessGuard {

    public static final String ROLE_CUSTOMER = "CUSTOMER";
    public static final String ROLE_DRIVER = "DRIVER";
    public static final String ROLE_ADMIN = "ADMIN";

    public static final String ATTR_USER_ID = "authenticatedUserId";
    public static final String ATTR_EMAIL = "authenticatedEmail";
    public static final String ATTR_ROLE = "authenticatedRole";

    private AccessGuard() {
    }

    public record Principal(String userId, String role) {
        public boolean isAdmin() {
            return ROLE_ADMIN.equals(role);
        }
    }

    public static Optional<Principal> currentPrincipal() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return Optional.empty();
        }
        Object userId = attributes.getAttribute(ATTR_USER_ID, RequestAttributes.SCOPE_REQUEST);
        Object role = attributes.getAttribute(ATTR_ROLE, RequestAttributes.SCOPE_REQUEST);
        if (!(userId instanceof String id) || !(role instanceof String r)) {
            return Optional.empty();
        }
        return Optional.of(new Principal(id, r));
    }

    /** The caller must hold one of the given roles. */
    public static void requireAnyRole(String... roles) {
        currentPrincipal().ifPresent(principal -> {
            if (Arrays.stream(roles).noneMatch(role -> role.equals(principal.role()))) {
                throw forbidden("Your role is not permitted to perform this action");
            }
        });
    }

    /** The caller must be the owner of the resource (matching token subject) or an admin. */
    public static void requireOwnerOrAdmin(String ownerId) {
        currentPrincipal().ifPresent(principal -> {
            if (!principal.isAdmin() && (ownerId == null || !ownerId.equals(principal.userId()))) {
                throw forbidden("You do not have access to this resource");
            }
        });
    }

    /**
     * The caller must be an admin, the customer who placed the order, or the driver
     * the order is assigned to.
     */
    public static void requireOrderAccess(String orderCustomerId, String orderDriverId) {
        currentPrincipal().ifPresent(principal -> {
            boolean allowed = principal.isAdmin()
                    || (ROLE_CUSTOMER.equals(principal.role()) && principal.userId().equals(orderCustomerId))
                    || (ROLE_DRIVER.equals(principal.role()) && principal.userId().equals(orderDriverId));
            if (!allowed) {
                throw forbidden("You do not have access to this order");
            }
        });
    }

    private static ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }
}

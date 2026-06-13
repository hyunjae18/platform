# DocMind External Auth Service

This service is a small NestJS adapter in front of Keycloak.

It keeps the DocMind API contract stable:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/validate`
- `POST /api/auth/request-password-reset`

Keycloak stores the users and validates credentials. The adapter then issues a DocMind-compatible HS256 JWT, because the current API gateway already validates tokens with `JWT_SECRET`.

The adapter also syncs a readable user profile into MongoDB:

```text
mongodb://mongodb:27017/docmind_identity
collection: users
```

Keycloak remains the source of truth for passwords. MongoDB stores profile, role, status, approval state, enterprise id, `keycloakId`, and `authProvider=keycloak`.

## Why It Is Optional

The existing Node identity server still works. This service is behind the Compose profile `external-auth`, so it will not start unless requested.

Start Keycloak and the adapter only:

```powershell
docker compose --profile external-auth up -d keycloak-postgres keycloak external-auth-service
```

Start the full platform using the Keycloak adapter instead of the current Node auth server:

```powershell
$env:DOCMIND_SMTP_PASS="your-gmail-app-password"
docker compose -f docker-compose.yml -f docker-compose.external-auth.yml --profile external-auth up -d --build
```

Keycloak admin UI:

```text
http://localhost:8081
```

Development admin credentials are configured in `docker-compose.yml`.

## Email

The service configures Keycloak SMTP with:

```text
SMTP_USER=docmind2026@gmail.com
SMTP_PASS=${DOCMIND_SMTP_PASS}
```

Keep the Gmail app password in your local environment as `DOCMIND_SMTP_PASS`; do not commit it.

## Notes

- Admin registration requests are created as disabled Keycloak users.
- A real admin approval flow should later enable the user and assign the `admin` role inside Keycloak.
- Password reset is delegated to Keycloak email links.
- User profiles are mirrored into MongoDB on register/login so the existing admin dashboard and reporting flows can read users.
- This is intentionally simple so it can prove the external-auth architecture without disturbing the working platform.

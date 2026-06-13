import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface KeycloakUserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  requestedRole: 'admin' | 'member';
  enterpriseId: string;
}

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'member';
  requestedRole: 'admin' | 'member';
  enterpriseId: string;
  enabled: boolean;
}

@Injectable()
export class KeycloakService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakService.name);
  private readonly baseUrl = (process.env.KEYCLOAK_BASE_URL || 'http://keycloak:8080').replace(/\/$/, '');
  readonly realm = process.env.KEYCLOAK_REALM || 'docmind';
  private readonly clientId = process.env.KEYCLOAK_CLIENT_ID || 'docmind-api';
  private readonly adminUser = process.env.KEYCLOAK_ADMIN || 'admin';
  private readonly adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

  async onModuleInit() {
    try {
      await this.waitForKeycloak();
      await this.bootstrapRealm();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Keycloak bootstrap skipped: ${message}`);
    }
  }

  async login(email: string, password: string) {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      username: email.trim().toLowerCase(),
      password,
    });

    const response = await fetch(`${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const token = (await response.json()) as { access_token: string };
    const payload = this.decodeJwtPayload(token.access_token);
    const profile = await this.getUserProfile(payload.sub);

    return {
      accessToken: token.access_token,
      user: profile,
      role: profile.role,
    };
  }

  async createUser(input: CreateUserInput): Promise<KeycloakUserProfile> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.findUserByEmail(email);

    if (existing) {
      throw new HttpException('Email already exists', HttpStatus.CONFLICT);
    }

    const adminToken = await this.getAdminToken();
    const names = input.name.trim().split(/\s+/);
    const response = await this.adminFetch(`/users`, {
      method: 'POST',
      token: adminToken,
      body: {
        username: email,
        email,
        firstName: names[0] || input.name.trim(),
        lastName: names.slice(1).join(' '),
        enabled: input.enabled,
        emailVerified: false,
        attributes: {
          name: input.name.trim(),
          enterpriseId: input.enterpriseId,
          requestedRole: input.requestedRole,
        },
        credentials: [{ type: 'password', value: input.password, temporary: false }],
      },
    });

    if (!response.ok) {
      await this.throwKeycloakError(response, 'Could not create user');
    }

    const created = await this.findUserByEmail(email);
    if (!created) {
      throw new HttpException('User created but could not be loaded', HttpStatus.BAD_GATEWAY);
    }

    await this.assignRealmRole(created.id, input.role, adminToken);
    return this.getUserProfile(created.id, adminToken);
  }

  async sendPasswordResetEmail(email: string) {
    const user = await this.findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return;
    }

    const adminToken = await this.getAdminToken();
    const response = await this.adminFetch(`/users/${user.id}/execute-actions-email`, {
      method: 'PUT',
      token: adminToken,
      body: ['UPDATE_PASSWORD'],
    });

    if (!response.ok) {
      await this.throwKeycloakError(response, 'Could not send password reset email');
    }
  }

  private async bootstrapRealm() {
    const adminToken = await this.getAdminToken();
    const realmResponse = await fetch(`${this.baseUrl}/admin/realms/${this.realm}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });

    if (realmResponse.status === 404) {
      const createRealm = await fetch(`${this.baseUrl}/admin/realms`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          realm: this.realm,
          enabled: true,
          loginWithEmailAllowed: true,
          resetPasswordAllowed: true,
          registrationAllowed: false,
          smtpServer: this.smtpServerConfig(),
        }),
      });

      if (!createRealm.ok) {
        await this.throwKeycloakError(createRealm, 'Could not create Keycloak realm');
      }
    } else if (!realmResponse.ok) {
      await this.throwKeycloakError(realmResponse, 'Could not inspect Keycloak realm');
    }

    await this.ensureClient(adminToken);
    await this.ensureRealmRole('admin', adminToken);
    await this.ensureRealmRole('member', adminToken);
    this.logger.log(`Keycloak realm '${this.realm}' is ready`);
  }

  private async ensureClient(adminToken: string) {
    const clients = await this.getJson<Array<{ id: string; clientId: string }>>(`/clients?clientId=${encodeURIComponent(this.clientId)}`, adminToken);
    if (clients.length > 0) {
      return;
    }

    const response = await this.adminFetch(`/clients`, {
      method: 'POST',
      token: adminToken,
      body: {
        clientId: this.clientId,
        name: 'DocMind API',
        enabled: true,
        publicClient: true,
        directAccessGrantsEnabled: true,
        standardFlowEnabled: true,
        redirectUris: [`${process.env.APP_BASE_URL || 'http://localhost:8080'}/*`],
        webOrigins: ['*'],
      },
    });

    if (!response.ok) {
      await this.throwKeycloakError(response, 'Could not create Keycloak client');
    }
  }

  private async ensureRealmRole(role: 'admin' | 'member', adminToken: string) {
    const response = await this.adminFetch(`/roles/${role}`, { method: 'GET', token: adminToken });
    if (response.ok) {
      return;
    }

    if (response.status !== 404) {
      await this.throwKeycloakError(response, `Could not inspect '${role}' role`);
    }

    const create = await this.adminFetch(`/roles`, {
      method: 'POST',
      token: adminToken,
      body: { name: role, description: `DocMind ${role} role` },
    });

    if (!create.ok) {
      await this.throwKeycloakError(create, `Could not create '${role}' role`);
    }
  }

  private async assignRealmRole(userId: string, role: 'admin' | 'member', adminToken: string) {
    const roleModel = await this.getJson<{ id: string; name: string }>(`/roles/${role}`, adminToken);
    const response = await this.adminFetch(`/users/${userId}/role-mappings/realm`, {
      method: 'POST',
      token: adminToken,
      body: [roleModel],
    });

    if (!response.ok && response.status !== 409) {
      await this.throwKeycloakError(response, `Could not assign '${role}' role`);
    }
  }

  private async getUserProfile(userId: string, adminToken?: string): Promise<KeycloakUserProfile> {
    const token = adminToken || (await this.getAdminToken());
    const user = await this.getJson<{
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      attributes?: Record<string, string[]>;
    }>(`/users/${userId}`, token);
    const roles = await this.getJson<Array<{ name: string }>>(`/users/${userId}/role-mappings/realm`, token);
    const role = roles.some((item) => item.name === 'admin') ? 'admin' : 'member';
    const attr = user.attributes || {};

    return {
      id: user.id,
      name: attr.name?.[0] || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id,
      email: user.email || '',
      role,
      requestedRole: attr.requestedRole?.[0] === 'admin' ? 'admin' : role,
      enterpriseId: attr.enterpriseId?.[0] || process.env.DEFAULT_ENTERPRISE_ID || 'ENT_DEFAULT',
    };
  }

  private async findUserByEmail(email: string) {
    const adminToken = await this.getAdminToken();
    const users = await this.getJson<Array<{ id: string; email?: string }>>(
      `/users?email=${encodeURIComponent(email)}&exact=true`,
      adminToken,
    );
    return users[0] || null;
  }

  private async getAdminToken() {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.adminUser,
      password: this.adminPassword,
    });

    const response = await fetch(`${this.baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      await this.throwKeycloakError(response, 'Could not get Keycloak admin token');
    }

    return ((await response.json()) as { access_token: string }).access_token;
  }

  private async adminFetch(
    path: string,
    options: { method: string; token: string; body?: unknown },
  ) {
    return fetch(`${this.baseUrl}/admin/realms/${this.realm}${path}`, {
      method: options.method,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }

  private async getJson<T>(path: string, token: string): Promise<T> {
    const response = await this.adminFetch(path, { method: 'GET', token });
    if (!response.ok) {
      await this.throwKeycloakError(response, `Keycloak request failed: ${path}`);
    }
    return response.json() as Promise<T>;
  }

  private async waitForKeycloak() {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}/realms/master`);
        if (response.ok) {
          return;
        }
      } catch {
        // Keycloak is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error('Keycloak did not become ready in time');
  }

  private smtpServerConfig() {
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const password = process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD;
    if (!user || !password) {
      return undefined;
    }

    return {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || '465',
      from: process.env.EMAIL_FROM || user,
      fromDisplayName: 'DocMind',
      ssl: 'true',
      auth: 'true',
      user,
      password,
    };
  }

  private decodeJwtPayload(token: string) {
    const [, payload] = token.split('.');
    if (!payload) {
      throw new HttpException('Invalid Keycloak token', HttpStatus.BAD_GATEWAY);
    }
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string };
  }

  private async throwKeycloakError(response: Response, fallback: string): Promise<never> {
    const text = await response.text();
    throw new HttpException(
      text || fallback,
      response.status >= 400 && response.status < 500 ? response.status : HttpStatus.BAD_GATEWAY,
    );
  }
}

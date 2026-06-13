import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { KeycloakService, KeycloakUserProfile } from './keycloak.service';
import { SyncedDocmindUser, UserSyncService } from './user-sync.service';

type RequestedRole = 'admin' | 'member';

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  enterpriseId?: string;
  requestedRole?: RequestedRole;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface ResetRequestBody {
  email?: string;
}

@Controller('/api/auth')
export class AuthController {
  constructor(
    private readonly keycloak: KeycloakService,
    private readonly jwt: JwtService,
    private readonly userSync: UserSyncService,
  ) {}

  @Get('/health')
  health() {
    return {
      status: 'ok',
      provider: 'keycloak',
      realm: this.keycloak.realm,
    };
  }

  @Post('/register')
  async register(@Body() body: RegisterBody) {
    if (!body.name || !body.email || !body.password) {
      throw new HttpException('Name, email, and password are required', HttpStatus.BAD_REQUEST);
    }

    const requestedRole = body.requestedRole === 'admin' ? 'admin' : 'member';
    const requiresApproval = requestedRole === 'admin';
    const role = requiresApproval ? 'member' : requestedRole;

    const user = await this.keycloak.createUser({
      name: body.name,
      email: body.email,
      password: body.password,
      role,
      requestedRole,
      enterpriseId: body.enterpriseId || process.env.DEFAULT_ENTERPRISE_ID || 'ENT_DEFAULT',
      enabled: !requiresApproval,
    });
    const syncedUser = await this.userSync.syncUser(user, {
      status: requiresApproval ? 'invited' : 'active',
      approvalStatus: requiresApproval ? 'pending' : 'approved',
      lastLoginAt: requiresApproval ? null : new Date().toISOString(),
    });

    if (requiresApproval) {
      return {
        requiresApproval: true,
        message: 'Admin account request submitted. Enable or promote the user in Keycloak when approved.',
        user: this.toDocmindUser(syncedUser),
      };
    }

    return {
      requiresApproval: false,
      token: this.issueDocmindToken(syncedUser, role),
      user: this.toDocmindUser(syncedUser),
    };
  }

  @HttpCode(200)
  @Post('/login')
  async login(@Body() body: LoginBody) {
    if (!body.email || !body.password) {
      throw new HttpException('Email and password are required', HttpStatus.BAD_REQUEST);
    }

    const session = await this.keycloak.login(body.email, body.password);
    const role = session.role === 'admin' ? 'admin' : 'member';
    const syncedUser = await this.userSync.syncUser(session.user, {
      status: 'active',
      approvalStatus: 'approved',
      lastLoginAt: new Date().toISOString(),
    });

    return {
      token: this.issueDocmindToken(syncedUser, role),
      keycloakToken: session.accessToken,
      user: this.toDocmindUser(syncedUser),
    };
  }

  @Get('/me')
  async me(@Headers('authorization') authorization?: string) {
    const user = this.verifyDocmindToken(authorization);
    return user;
  }

  @Get('/validate')
  async validate(@Headers('authorization') authorization?: string) {
    const user = this.verifyDocmindToken(authorization);
    return { user };
  }

  @HttpCode(200)
  @Post('/request-password-reset')
  async requestPasswordReset(@Body() body: ResetRequestBody) {
    if (!body.email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    await this.keycloak.sendPasswordResetEmail(body.email);
    return {
      message: 'If the account exists, Keycloak password reset instructions were sent.',
      delivery: 'keycloak-email',
    };
  }

  @HttpCode(200)
  @Post('/reset-password')
  async resetPassword() {
    return {
      message: 'Password reset is handled by the secure Keycloak email link.',
      provider: 'keycloak',
    };
  }

  private issueDocmindToken(user: KeycloakUserProfile | SyncedDocmindUser, role: 'admin' | 'member') {
    return this.jwt.sign({
      sub: user.id,
      role,
      email: user.email,
      enterpriseId: user.enterpriseId,
      keycloakId: 'keycloakId' in user ? user.keycloakId : user.id,
    });
  }

  private verifyDocmindToken(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
    if (!token) {
      throw new HttpException('Missing bearer token', HttpStatus.UNAUTHORIZED);
    }

    try {
      const payload = this.jwt.verify(token) as {
        sub: string;
        email: string;
        role: 'admin' | 'member';
        enterpriseId: string;
        keycloakId?: string;
      };

      return {
        id: payload.sub,
        email: payload.email,
        name: payload.email.split('@')[0],
        role: payload.role,
        requestedRole: payload.role,
        status: 'active',
        approvalStatus: 'approved',
        enterpriseId: payload.enterpriseId,
        lastLoginAt: null,
        keycloakId: payload.keycloakId || payload.sub,
      };
    } catch {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }
  }

  private toDocmindUser(
    user: KeycloakUserProfile | SyncedDocmindUser,
  ) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      requestedRole: user.requestedRole,
      status: 'status' in user ? user.status : 'active',
      approvalStatus: 'approvalStatus' in user ? user.approvalStatus : 'approved',
      enterpriseId: user.enterpriseId,
      lastLoginAt: 'lastLoginAt' in user ? user.lastLoginAt : null,
      keycloakId: 'keycloakId' in user ? user.keycloakId : user.id,
    };
  }
}

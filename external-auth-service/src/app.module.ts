import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { UserSyncService } from './user-sync.service';
import { KeycloakService } from './keycloak.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'docmind-secure-jwt-key-2024',
      signOptions: { expiresIn: (process.env.DOCMIND_TOKEN_TTL || '12h') as '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [KeycloakService, UserSyncService],
})
export class AppModule {}

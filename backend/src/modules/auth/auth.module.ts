import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../../entities/user.entity';
import { AuthConfig } from '../../config/auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * AuthModule (R1, D1/D2/D3) — device-UUID identity, dual JWT, permission
 * resolution. Guards used by all other modules (design "Module Dependency
 * DAG": `AuthModule <- guards used by all`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const authConfig = config.get<AuthConfig>('auth')!;
        return {
          secret: authConfig.jwtAccessSecret,
          signOptions: { expiresIn: authConfig.jwtAccessExpiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

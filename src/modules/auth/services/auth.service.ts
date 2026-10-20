import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginUser } from '../types/auth.types';


@Injectable()
export class AuthService {
  private readonly users: LoginUser[] = [
    {
      email: process.env.CANDIDATE_EMAIL?.toLowerCase() ?? '',
      password: process.env.CANDIDATE_PASSWORD ?? '',
      role: 'candidate',
    },
    {
      email: process.env.ADMIN_EMAIL?.toLowerCase() ?? '',
      password: process.env.ADMIN_PASSWORD ?? '',
      role: 'admin',
    },
  ];

  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.users.find(
      (candidate) => candidate.email === normalizedEmail,
    );

    if (!user || password != user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      sub: user.email,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        email: user.email,
        role: user.role,
      },
    };
  }
}


import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @ApiProperty()
  email!: string;

  @IsString()
  @MinLength(1)
  @ApiProperty()
  password!: string;
}
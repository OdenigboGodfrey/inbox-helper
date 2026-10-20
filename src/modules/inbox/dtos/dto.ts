
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
import { Type } from 'class-transformer';

export class CandidateMessageDto {
  constructor(init: Partial<CandidateMessageDto>) {
    Object.assign(this, init);
  }
  @ApiProperty({
    example: 'candidate@example.com',
    description: 'Candidate email address',
  })
  @IsEmail()
  sender: string;

  @ApiProperty({
    example: 'Could we schedule an interview next week?',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body: string;
}

export class CreateBatchDto {
  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty({
    type: [CandidateMessageDto],
    minItems: 1,
    maxItems: 5,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CandidateMessageDto)
  messages: CandidateMessageDto[];
}

export class ReviewDraftDto {
  @ApiProperty({
    example: 1,
    description: 'Version returned when the draft was retrieved',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  version: number;
}

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;
}

export class ListMessagesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}



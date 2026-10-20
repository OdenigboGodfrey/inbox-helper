
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/types/auth.types';
import { InboxService } from '../services/inbox.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CandidateMessageDto, CreateBatchDto, CreateMessageDto, ListMessagesDto } from '../dtos/dto';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';


interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@ApiTags('inbox')
@ApiBearerAuth('access-token')
@Controller('inbox/messages')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Post('batch')
  @Roles('candidate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  createBatch(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBatchDto,
  ) {
    
    return this.inboxService.createBatch(req.user, dto);
  }

  @Post()
  @Roles('candidate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMessageDto,
  ) {
    
    return this.inboxService.createCandidateMessage(req.user, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListMessagesDto,
  ) {
    return this.inboxService.listMessages(req.user, query);
  }

  @Post(':id/approve')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { version: number },
  ) {
    return this.inboxService.reviewMessage(
      id,
      req.user,
      'approve',
      body.version,
    );
  }

  @Post(':id/reject')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { version: number },
  ) {
    return this.inboxService.reviewMessage(
      id,
      req.user,
      'reject',
      body.version,
    );
  }

  @Post(':id/regenerate')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  regenerate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inboxService.regenerate(
      id
    );
  }
}

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TelegramConfig } from '../../config/telegram.config';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';
import { getTourProfileForRole } from './constants/tour-profiles.constants';

/**
 * Shape of the Telegram Update payload we care about. The full
 * Telegram API defines a much larger `Update` type; we narrow to
 * the only fields the `/start` handler reads to keep the controller
 * surface tight (and the test fixture small).
 */
interface TelegramUpdatePayload {
  update_id?: number;
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
}

/**
 * Webhook controller (2026-10-10-user-onboarding-telegram-tour, D3/D4).
 * `POST /api/telegram/webhook` receives updates from the Telegram Bot
 * API and processes the `/start <token>` command to link the user's
 * Telegram chat to their system account.
 *
 * Security:
 *  - Validates `X-Telegram-Bot-Api-Secret-Token` against
 *    `TELEGRAM_WEBHOOK_SECRET` (401 on mismatch).
 *  - Returns 200 even for malformed payloads — Telegram retries on
 *    non-2xx, and we don't want the bot to receive duplicate
 *    messages.
 *
 * Flow (D4):
 *  1. Extract `<token>` from the `/start <token>` text.
 *  2. Consume the token via `TelegramLinkService.consume` (atomic GET+DEL).
 *  3. Look up the user; reject `reporter` (D7 isolation).
 *  4. UPDATE `users.telegram_chat_id`.
 *  5. Enqueue the welcome + tour message via `TelegramService.enqueue`
 *     (D5: outbox only — no synchronous HTTP call to the bot here).
 */
@Controller('telegram')
export class TelegramBotController {
  private readonly logger = new Logger(TelegramBotController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly linkService: TelegramLinkService,
    private readonly telegram: TelegramService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdatePayload,
  ): Promise<{ ok: true }> {
    this.assertSecret(secret);
    await this.handleUpdate(update);
    return { ok: true };
  }

  private assertSecret(secret: string | undefined): void {
    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    if (!cfg.webhookSecret) {
      // Misconfiguration. Reject loudly so a missing env var in
      // prod does not silently accept every webhook.
      throw new UnauthorizedException(
        'TELEGRAM_WEBHOOK_SECRET is not configured',
      );
    }
    if (secret !== cfg.webhookSecret) {
      this.logger.warn('webhook: secret header mismatch');
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
  }

  private async handleUpdate(update: TelegramUpdatePayload): Promise<void> {
    const text = update?.message?.text;
    if (!text) return;
    const chatId = update.message?.chat?.id;
    if (chatId === undefined || chatId === null) {
      // Telegram always sends a chat object for messages, but defend
      // against schema drift — if there's no chat id we cannot
      // reply. 200 OK so Telegram does not retry.
      return;
    }

    // The user must press "Iniciar" or type `/start <token>`.
    // Telegram's deep link triggers `/start <token>` automatically.
    const match = /^\/start(?:\s+(?<token>[\w-]+))?\s*$/.exec(text.trim());
    if (!match || !match.groups?.token) {
      // Some other message — ignore (Telegram also sends stickers,
      // service messages, etc.). 200 OK, no reply.
      return;
    }
    const token = match.groups.token;

    // Atomic GET+DEL on the token. Concurrent `/start` calls for
    // the same token only one succeeds (D2: "un solo uso").
    const userId = await this.linkService.consume(token);
    if (!userId) {
      await this.sendMessageToChat(
        chatId,
        'El enlace de activación ha expirado o no es válido. Ingresa a tu perfil en la plataforma para generar un nuevo enlace.',
      );
      return;
    }

    // Load the user (lightweight — we need role + chat_id).
    const rows = await this.dataSource.query<
      Array<{ id: string; role: string; deleted_at: Date | null }>
    >(
      `SELECT id, role, deleted_at FROM users WHERE id = $1`,
      [userId],
    );
    if (rows.length === 0 || rows[0].deleted_at !== null) {
      // Token pointed at a user that no longer exists / was soft-deleted.
      await this.sendMessageToChat(
        chatId,
        'El enlace apunta a un usuario que ya no está activo. Contacta al administrador.',
      );
      return;
    }
    const user = rows[0];

    const profile = getTourProfileForRole(user.role);
    if (!profile) {
      // D7: citizens (`reporter`) or any unknown role do not get a
      // tour. We still bind the chat_id for future messaging
      // (e.g. incident reports) but refuse to leak the staff
      // tour content.
      await this.dataSource.query(
        `UPDATE users SET telegram_chat_id = $1 WHERE id = $2`,
        [String(chatId), user.id],
      );
      await this.sendMessageToChat(
        chatId,
        'Tu cuenta fue vinculada, pero este flujo de Telegram es solo para personal interno.',
      );
      this.logger.warn(
        `webhook: user ${user.id} role=${user.role} linked but no tour profile; D7 isolation applied`,
      );
      return;
    }

    // Happy path: persist chat_id and send the tour.
    await this.dataSource.query(
      `UPDATE users SET telegram_chat_id = $1 WHERE id = $2`,
      [String(chatId), user.id],
    );
    await this.sendMessageToChat(
      chatId,
      `${profile.welcome}\n\n${profile.tour}`,
    );
    this.logger.log(
      `webhook: linked telegram_chat_id to user ${user.id} (role=${user.role})`,
    );
  }

  private async sendMessageToChat(chatId: number | string, text: string): Promise<void> {
    await this.telegram.enqueue({ chat_id: String(chatId), text });
  }
}

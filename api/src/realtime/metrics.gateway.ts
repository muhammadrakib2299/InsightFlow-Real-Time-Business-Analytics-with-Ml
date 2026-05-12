import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { RedisService } from '../common/redis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

const TICK_CHANNEL_PREFIX = 'metrics:tick:';

interface AuthSocket extends Socket {
  data: {
    userId?: string;
    workspaceId?: string;
  };
}

/**
 * Socket.IO gateway. The frontend connects to /ws/<workspaceId> with a
 * Bearer access token in auth.token (or the Authorization header on the
 * handshake). On successful auth the socket joins a workspace room and
 * starts receiving aggregated metric ticks.
 *
 * Tick source: the ingestion consumer (or in M3+ the forecast nightly job)
 * publishes JSON payloads to Redis `metrics:tick:<workspaceId>`. This
 * gateway subscribes once per active workspace and fans out via Socket.IO
 * rooms. Raw events are never streamed to the browser.
 */
@WebSocketGateway({
  namespace: /^\/ws\/.+$/,
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
export class MetricsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MetricsGateway.name);

  @WebSocketServer()
  server!: Server;

  private subscribedWorkspaces = new Set<string>();

  constructor(
    private readonly tokens: TokenService,
    private readonly workspaces: WorkspacesService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    // pmessage events are routed to fanout(); subscribe on demand per-workspace.
    this.redis.subscriber.on('message', (channel, raw) => {
      if (!channel.startsWith(TICK_CHANNEL_PREFIX)) return;
      const workspaceId = channel.slice(TICK_CHANNEL_PREFIX.length);
      this.fanout(workspaceId, raw);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const ws of this.subscribedWorkspaces) {
      await this.redis.subscriber.unsubscribe(`${TICK_CHANNEL_PREFIX}${ws}`).catch(() => undefined);
    }
  }

  afterInit() {
    this.logger.log('MetricsGateway initialised');
  }

  async handleConnection(@ConnectedSocket() socket: AuthSocket) {
    try {
      const workspaceId = this.extractWorkspaceId(socket.nsp.name);
      const token = this.extractToken(socket);
      if (!workspaceId || !token) {
        socket.disconnect();
        return;
      }
      const payload = await this.tokens.verifyAccess(token);
      const role = await this.workspaces.resolveRole(workspaceId, payload.sub);
      if (!role) {
        socket.disconnect();
        return;
      }
      socket.data.userId = payload.sub;
      socket.data.workspaceId = workspaceId;
      socket.join(`ws:${workspaceId}`);

      // Subscribe to the Redis channel once per workspace
      if (!this.subscribedWorkspaces.has(workspaceId)) {
        await this.redis.subscriber.subscribe(`${TICK_CHANNEL_PREFIX}${workspaceId}`);
        this.subscribedWorkspaces.add(workspaceId);
      }

      socket.emit('hello', { workspaceId, role });
      this.logger.log(`socket connected userId=${payload.sub} ws=${workspaceId}`);
    } catch (err) {
      this.logger.warn(`socket auth failed: ${(err as Error).message}`);
      socket.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() socket: AuthSocket) {
    if (socket.data.workspaceId) {
      this.logger.log(
        `socket disconnected userId=${socket.data.userId} ws=${socket.data.workspaceId}`,
      );
    }
  }

  private fanout(workspaceId: string, raw: string) {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
    this.server.to(`ws:${workspaceId}`).emit('tick', payload);
  }

  private extractWorkspaceId(namespace: string): string | null {
    // namespace like `/ws/<uuid>`
    const m = namespace.match(/^\/ws\/([^/]+)$/);
    if (!m) return null;
    const id = m[1];
    return /^[0-9a-fA-F-]{36}$/.test(id) ? id : null;
  }

  private extractToken(socket: AuthSocket): string | null {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const fromAuth = typeof auth.token === 'string' ? auth.token : null;
    if (fromAuth) return fromAuth.replace(/^Bearer\s+/i, '');
    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7);
    }
    return null;
  }
}

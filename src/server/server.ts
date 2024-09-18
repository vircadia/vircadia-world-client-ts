import { Application, Router } from 'jsr:@oak/oak';
import { parseArgs } from 'jsr:@std/cli';
import { load } from 'jsr:@std/dotenv';
import { log } from '../shared/modules/vircadia-world-meta/general/modules/log.ts';
import {
    Environment,
    Server,
} from '../shared/modules/vircadia-world-meta/meta.ts';
import { CaddyManager } from './modules/caddy/caddy_manager.ts';
import { Supabase } from './modules/supabase/supabase_manager.ts';

const config = loadConfig();

async function init() {
    const debugMode = config[Environment.ENVIRONMENT_VARIABLE.SERVER_DEBUG];

    if (debugMode) {
        log({
            message: 'Server debug mode enabled',
            type: 'info',
        });
    }

    log({
        message: 'Starting Vircadia World Server',
        type: 'info',
    });
    const app = new Application();
    const router = new Router();

    // CORS middleware
    app.use(async (ctx, next) => {
        ctx.response.headers.set(
            'Access-Control-Allow-Origin',
            config[Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_ORIGINS],
        );
        ctx.response.headers.set(
            'Access-Control-Allow-Methods',
            config[
                Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_METHODS_REQ
            ],
        );
        ctx.response.headers.set(
            'Access-Control-Allow-Headers',
            config[
                Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_HEADERS_REQ
            ],
        );
        if (ctx.request.method === 'OPTIONS') {
            ctx.response.status = 200;
            return;
        }
        await next();
    });

    log({
        message: 'Starting Supabase',
        type: 'info',
    });

    const forceRestartSupabase = Deno.args.includes('--force-restart-supabase');

    const supabase = Supabase.getInstance(debugMode);
    if (!(await supabase.isRunning()) || forceRestartSupabase) {
        try {
            await supabase.initializeAndStart({
                forceRestart: forceRestartSupabase,
            });
        } catch (error) {
            log({
                message: `Failed to initialize and start Supabase: ${error}`,
                type: 'error',
            });
            await supabase.debugStatus();
        }

        if (!(await supabase.isRunning())) {
            log({
                message:
                    'Supabase services are not running after initialization. Exiting.',
                type: 'error',
            });
            Deno.exit(1);
        }
    }

    log({
        message: 'Supabase services are running correctly.',
        type: 'info',
    });

    log({
        message: 'Setting up HTTP routes',
        type: 'info',
    });

    // Add the route from httpRouter.ts
    router.get(Server.E_HTTPRequestPath.CONFIG_AND_STATUS, async (ctx) => {
        log({
            message:
                `${Server.E_HTTPRequestPath.CONFIG_AND_STATUS} route called`,
            type: 'debug',
            debug: debugMode,
        });

        const statusUrls = await supabase.getStatus();
        const response: Server.I_REQUEST_ConfigAndStatusResponse = {
            API_URL: statusUrls.api.host + ':' + statusUrls.api.port +
                statusUrls.api.path,
            STORAGE_URL: statusUrls.s3Storage.host + ':' +
                statusUrls.s3Storage.port + statusUrls.s3Storage.path,
        };

        ctx.response.body = response;
    });

    log({
        message: 'HTTP routes are set up correctly.',
        type: 'info',
    });

    // Use the router
    app.use(router.routes());
    app.use(router.allowedMethods());

    // Setup Caddy
    const caddyManager = CaddyManager.getInstance();
    await caddyManager.setupAndStart([
        {
            from: `${
                config[Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_HOST]
            }:${config[Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_PORT]}`,
            to: `${config[Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_HOST]}:${
                config[Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_PORT]
            }`,
        },
        // Add more proxy configurations here as needed
    ]);

    // Launch Oak server
    log({
        message: `Oak server is running on ${
            config[Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_HOST]
        }:${config[Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_PORT]}`,
        type: 'success',
    });

    try {
        await app.listen({
            port: config[Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_PORT],
            hostname: config[Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_HOST],
        });
    } catch (error) {
        log({
            message: `Failed to start Oak server: ${error}`,
            type: 'error',
        });
        await caddyManager.stop();
    }
}

await init();

interface ServerConfig {
    [Environment.ENVIRONMENT_VARIABLE.SERVER_DEBUG]: boolean;
    [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_HOST]: string;
    [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_PORT]: number;
    [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_ORIGINS]: string;
    [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_METHODS_REQ]: string;
    [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_HEADERS_REQ]: string;
    [Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_HOST]: string;
    [Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_PORT]: number;
}

export function loadConfig(): ServerConfig {
    // Load .env file
    load({ export: true });

    // Parse command-line arguments
    const args = parseArgs(Deno.args);

    return {
        [Environment.ENVIRONMENT_VARIABLE.SERVER_DEBUG]:
            Deno.env.get(Environment.ENVIRONMENT_VARIABLE.SERVER_DEBUG) ===
                'true' || args.debug || false,
        [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_HOST]:
            Deno.env.get(Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_HOST) ||
            args.host || '0.0.0.0',
        [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_PORT]: parseInt(
            Deno.env.get(Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_PORT) ||
                args.port || '3000',
        ),
        [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_ORIGINS]:
            Deno.env.get(
                Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_ORIGINS,
            ) || args.allowedOrigins || '*',
        [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_METHODS_REQ]:
            Deno.env.get(
                Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_METHODS_REQ,
            ) || args.allowedMethodsReq || 'GET, POST, PUT, DELETE, OPTIONS',
        [Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_HEADERS_REQ]:
            Deno.env.get(
                Environment.ENVIRONMENT_VARIABLE.SERVER_OAK_ALLOWED_HEADERS_REQ,
            ) || args.allowedHeadersReq || 'Content-Type, Authorization',
        [Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_HOST]:
            Deno.env.get(Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_HOST) ||
            args.caddyHost || '0.0.0.0',
        [Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_PORT]: parseInt(
            Deno.env.get(Environment.ENVIRONMENT_VARIABLE.SERVER_CADDY_PORT) ||
                args.caddyPort || '3010',
        ),
    };
}

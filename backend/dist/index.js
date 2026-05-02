"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const requestId_1 = require("./middleware/requestId");
const serverLog_1 = require("./lib/serverLog");
dotenv_1.default.config({ override: true });
(0, serverLog_1.serverLog)('BOOT IPM backend loading pid=%s cwd=%s', process.pid, process.cwd());
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
exports.prisma = prisma;
const port = process.env.PORT || 4000;
const uploadsPath = path_1.default.join(process.cwd(), 'uploads');
app.use(requestId_1.requestIdMiddleware);
// Log every request as soon as it hits Express (confirms the browser actually reached this process).
app.use((req, res, next) => {
    const started = Date.now();
    (0, serverLog_1.serverLog)(`[HTTP][${req.requestId}] → ${req.method} ${req.url} origin=${req.get('origin') || '-'} ip=${req.ip || req.socket.remoteAddress || '-'}`);
    res.on('finish', () => {
        (0, serverLog_1.serverLog)(`[HTTP][${req.requestId}] ← ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
});
// Allow browser calls from LAN dev URLs (e.g. http://192.168.x.x:3000). A fixed origin of localhost only
// makes fetch() appear to "hang" or fail silently when you open Next via the network URL.
const corsOrigin = process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((s) => s.trim())
    : true;
app.use((0, cors_1.default)({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
}));
app.use(express_1.default.json());
// Serve uploads
app.use('/uploads', express_1.default.static(uploadsPath));
// Routes
const settings_1 = __importDefault(require("./routes/settings"));
const tests_1 = __importDefault(require("./routes/tests"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const emails_1 = __importDefault(require("./routes/emails"));
const ailogs_1 = __importDefault(require("./routes/ailogs"));
const reviews_1 = __importDefault(require("./routes/reviews"));
const lots_1 = __importDefault(require("./routes/lots"));
app.use('/api/settings', settings_1.default);
app.use('/api/tests', tests_1.default);
app.use('/api/webhooks', webhooks_1.default);
app.use('/api/emails', emails_1.default);
app.use('/api/ailogs', ailogs_1.default);
app.use('/api/reviews', reviews_1.default);
app.use('/api/lots', lots_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
/** Quick dependency probe — use when debugging “no logs” / silent failures (does not call OpenAI or Gmail). */
app.get('/api/debug/ready', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tokenPath = path_1.default.join(process.cwd(), 'token.json');
    const credPath = path_1.default.join(process.cwd(), 'credentials.json');
    let database = false;
    let databaseError = null;
    try {
        yield prisma.$queryRaw `SELECT 1`;
        database = true;
    }
    catch (e) {
        databaseError = (e === null || e === void 0 ? void 0 : e.message) || String(e);
    }
    res.json({
        requestId: req.requestId,
        time: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || null,
        checks: {
            database,
            databaseError,
            gmailCredentialsFile: fs_1.default.existsSync(credPath),
            gmailTokenFile: fs_1.default.existsSync(tokenPath),
            openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY),
        },
    });
}));
app.listen(port, '0.0.0.0', () => {
    (0, serverLog_1.serverLog)('Listening http://0.0.0.0:%s  health=GET /health  debug=GET /api/debug/ready', port);
    if (!process.stderr.isTTY) {
        (0, serverLog_1.serverLog)('Tip: stdout/stderr may be fully buffered in this environment. Set BACKEND_LOG_FILE=%s for a guaranteed on-disk trace.', path_1.default.join(process.cwd(), 'backend-debug.log'));
    }
});

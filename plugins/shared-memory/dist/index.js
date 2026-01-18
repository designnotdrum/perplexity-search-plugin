#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const core_1 = require("@brain-jar/core");
const local_store_1 = require("./local-store");
const summary_manager_1 = require("./summary-manager");
const profile_1 = require("./profile");
const chess_timer_1 = require("./chess-timer");
const LOCAL_DB_PATH = path.join(os.homedir(), '.config', 'brain-jar', 'local.db');
async function runSetup() {
    const { input } = await Promise.resolve().then(() => __importStar(require('@inquirer/prompts')));
    console.log('\n[brain] Shared Memory Setup\n');
    console.log('To get your Mem0 API key:');
    console.log('1. Go to https://app.mem0.ai');
    console.log('2. Sign up (free tier: 10,000 memories)');
    console.log('3. Navigate to Settings -> API Keys');
    console.log('4. Create and copy your key\n');
    const apiKey = await input({
        message: 'Enter your Mem0 API key:',
        validate: (value) => {
            if (!value || value.trim().length === 0) {
                return 'API key is required';
            }
            return true;
        },
    });
    (0, core_1.saveConfig)({
        mem0_api_key: apiKey.trim(),
        default_scope: 'global',
        auto_summarize: true,
    });
    console.log(`\n[OK] Configuration saved to ${(0, core_1.getConfigPath)()}`);
    console.log('[OK] Ready to use shared-memory!\n');
}
async function main() {
    // Handle --setup flag
    if (process.argv.includes('--setup')) {
        await runSetup();
        process.exit(0);
    }
    // Check configuration - but don't exit if missing, just note it
    const configStatus = (0, core_1.checkConfig)();
    const isConfigured = configStatus.status !== 'missing';
    const config = isConfigured ? (0, core_1.loadConfig)() : null;
    // Local store works without Mem0 config
    const localStore = new local_store_1.LocalStore(LOCAL_DB_PATH);
    // Chess timer stores (use same DB for simplicity)
    const sessionStore = new chess_timer_1.SessionStore(LOCAL_DB_PATH);
    const predictor = new chess_timer_1.Predictor(sessionStore);
    // Mem0 client only if configured
    const mem0Client = config ? new core_1.Mem0Client(config.mem0_api_key) : null;
    // Profile manager and inference engine (always available)
    const profileManager = new profile_1.ProfileManager();
    const inferenceEngine = new profile_1.InferenceEngine();
    // Summary manager for auto-summaries
    const summaryManager = new summary_manager_1.SummaryManager(mem0Client, localStore);
    // Connect profile manager to Mem0 if configured
    if (mem0Client) {
        profileManager.setMem0Client(mem0Client);
        // Sync profile from Mem0 on startup
        try {
            const syncResult = await profileManager.syncFromMem0();
            console.error(`[shared-memory] Profile sync: ${syncResult.action}`);
        }
        catch (error) {
            console.error('[shared-memory] Profile sync failed:', error);
        }
        // One-time migration: prune duplicate profile snapshots
        try {
            const pruned = await mem0Client.pruneProfileHistory();
            if (pruned > 0) {
                console.error(`[shared-memory] Pruned ${pruned} duplicate profile snapshot(s)`);
            }
        }
        catch (error) {
            console.error('[shared-memory] Profile prune failed:', error);
        }
    }
    if (!isConfigured) {
        console.error('[shared-memory] Warning: Not configured. Run with --setup or create config file.');
        console.error('[shared-memory] Local storage will work, but Mem0 cloud sync disabled.');
    }
    // Create MCP server
    const server = new mcp_js_1.McpServer({
        name: 'shared-memory',
        version: '2.1.2',
    });
    // Register tools
    server.tool('add_memory', 'Store a memory with enriched context', {
        content: zod_1.z.string().describe('The memory content with context and sentiment'),
        scope: zod_1.z.string().optional().describe('Scope: "global" or "project:<name>"'),
        tags: zod_1.z.array(zod_1.z.string()).optional().describe('Tags for categorization'),
    }, async (args) => {
        const scope = args.scope || config?.default_scope || (0, core_1.detectScope)();
        const tags = args.tags || [];
        // Store locally first (working memory)
        const memory = localStore.add({
            content: args.content,
            scope,
            tags,
            source: { agent: 'claude-code', action: 'explicit' },
        });
        // Also sync to Mem0 (persistent memory) if configured
        if (mem0Client) {
            try {
                await mem0Client.add(args.content, {
                    scope,
                    tags,
                    source_agent: 'claude-code',
                    source_action: 'explicit',
                });
            }
            catch (error) {
                // Log but don't fail - local storage succeeded
                console.error('[shared-memory] Mem0 sync failed:', error);
            }
        }
        // Check for auto-summary trigger
        let summaryNote = '';
        try {
            const summaryResult = await summaryManager.onMemoryAdded(scope);
            if (summaryResult.summarized) {
                summaryNote = ` [Auto-summary generated for ${scope}]`;
            }
        }
        catch (error) {
            console.error('[shared-memory] Auto-summary check failed:', error);
        }
        const syncNote = mem0Client ? '' : ' (local only - configure Mem0 for cloud sync)';
        return {
            content: [
                {
                    type: 'text',
                    text: `Memory stored (id: ${memory.id})${syncNote}${summaryNote}`,
                },
            ],
        };
    });
    server.tool('search_memory', 'Search memories semantically', {
        query: zod_1.z.string().describe('Natural language search query'),
        scope: zod_1.z.string().optional().describe('Filter by scope'),
        limit: zod_1.z.number().optional().describe('Maximum results (default: 10)'),
    }, async (args) => {
        const limit = args.limit || 10;
        // Try local first
        let results = localStore.search(args.query, args.scope, limit);
        // If few local results, also search Mem0 (if configured)
        if (mem0Client && results.length < limit) {
            try {
                const mem0Results = await mem0Client.search(args.query, limit);
                // Merge, avoiding duplicates by content
                const existingContent = new Set(results.map((r) => r.content));
                for (const r of mem0Results) {
                    if (!existingContent.has(r.content)) {
                        results.push(r);
                    }
                }
            }
            catch (error) {
                console.error('[shared-memory] Mem0 search failed:', error);
            }
        }
        // Apply scope filter if specified
        if (args.scope) {
            results = results.filter((r) => r.scope === args.scope || r.scope === 'global');
        }
        const syncNote = mem0Client ? '' : '\n\n(Searching local only - configure Mem0 for cloud sync)';
        return {
            content: [
                {
                    type: 'text',
                    text: results.length > 0
                        ? results.map((m) => `[${m.scope}] ${m.content}`).join('\n\n---\n\n') + syncNote
                        : 'No memories found.' + syncNote,
                },
            ],
        };
    });
    server.tool('list_memories', 'List recent memories', {
        scope: zod_1.z.string().optional().describe('Filter by scope'),
        tags: zod_1.z.array(zod_1.z.string()).optional().describe('Filter by tags'),
        limit: zod_1.z.number().optional().describe('Maximum results'),
    }, async (args) => {
        const results = localStore.list({
            scope: args.scope,
            tags: args.tags,
            limit: args.limit,
        });
        return {
            content: [
                {
                    type: 'text',
                    text: results.length > 0
                        ? results
                            .map((m) => `[${m.scope}] (${m.tags.join(', ') || 'no tags'})\n${m.content}`)
                            .join('\n\n---\n\n')
                        : 'No memories found.',
                },
            ],
        };
    });
    server.tool('delete_memory', 'Delete a memory by ID', {
        id: zod_1.z.string().describe('Memory ID to delete'),
    }, async (args) => {
        const deleted = localStore.delete(args.id);
        // Also try to delete from Mem0 (if configured)
        if (mem0Client) {
            try {
                await mem0Client.delete(args.id);
            }
            catch {
                // Ignore - might not exist in Mem0
            }
        }
        return {
            content: [
                {
                    type: 'text',
                    text: deleted ? `Memory ${args.id} deleted.` : `Memory ${args.id} not found.`,
                },
            ],
        };
    });
    // --- Profile Management Tools ---
    server.tool('get_user_profile', 'Get the user profile or a specific section', {
        section: zod_1.z
            .enum(['all', 'identity', 'technical', 'workingStyle', 'knowledge', 'personal', 'meta'])
            .optional()
            .describe('Section to retrieve (default: all)'),
    }, async (args) => {
        const profile = await profileManager.load();
        const section = args.section || 'all';
        let data;
        if (section === 'all') {
            data = profile;
        }
        else {
            data = profile[section];
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    });
    server.tool('update_user_profile', 'Update a field in the user profile', {
        field: zod_1.z.string().describe('Dot-path to field (e.g., "identity.name", "technical.languages")'),
        value: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe('Value to set'),
        append: zod_1.z.boolean().optional().describe('For array fields, append instead of replace'),
    }, async (args) => {
        if (args.append && Array.isArray(args.value)) {
            await profileManager.addToArray(args.field, args.value);
        }
        else if (args.append && typeof args.value === 'string') {
            await profileManager.addToArray(args.field, [args.value]);
        }
        else {
            await profileManager.set(args.field, args.value);
        }
        return {
            content: [
                {
                    type: 'text',
                    text: `Profile updated: ${args.field} = ${JSON.stringify(args.value)}`,
                },
            ],
        };
    });
    server.tool('propose_profile_inference', 'Propose an inferred preference for user confirmation', {
        field: zod_1.z.string().describe('Dot-path to field (e.g., "technical.languages")'),
        value: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe('Inferred value'),
        evidence: zod_1.z.string().describe('What triggered this inference'),
        confidence: zod_1.z.enum(['high', 'medium', 'low']).describe('Confidence level'),
        source: zod_1.z.enum(['codebase', 'conversation', 'config']).optional().describe('Source of inference'),
    }, async (args) => {
        const inference = await profileManager.addInference({
            field: args.field,
            value: args.value,
            evidence: args.evidence,
            confidence: args.confidence,
            source: args.source || 'conversation',
        });
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Inference proposed - ask user to confirm',
                        inference_id: inference.id,
                        field: inference.field,
                        value: inference.value,
                        evidence: inference.evidence,
                    }),
                },
            ],
        };
    });
    server.tool('confirm_profile_update', 'Confirm a pending profile inference', {
        inference_id: zod_1.z.string().describe('ID of the inference to confirm'),
    }, async (args) => {
        const confirmed = await profileManager.confirmInference(args.inference_id);
        return {
            content: [
                {
                    type: 'text',
                    text: confirmed
                        ? `Inference ${args.inference_id} confirmed and applied to profile.`
                        : `Inference ${args.inference_id} not found or already processed.`,
                },
            ],
        };
    });
    server.tool('reject_profile_update', 'Reject a pending profile inference', {
        inference_id: zod_1.z.string().describe('ID of the inference to reject'),
    }, async (args) => {
        const rejected = await profileManager.rejectInference(args.inference_id);
        return {
            content: [
                {
                    type: 'text',
                    text: rejected
                        ? `Inference ${args.inference_id} rejected.`
                        : `Inference ${args.inference_id} not found or already processed.`,
                },
            ],
        };
    });
    server.tool('get_onboarding_questions', 'Get the next batch of onboarding questions based on profile gaps', {
        category: zod_1.z
            .enum(['identity', 'technical', 'workingStyle', 'personal'])
            .optional()
            .describe('Filter by category'),
        count: zod_1.z.number().optional().describe('Maximum questions to return (default: 3)'),
    }, async (args) => {
        const profile = await profileManager.load();
        let questions = profileManager.getNextOnboardingQuestions(profile, args.count || 3);
        if (args.category) {
            questions = questions.filter((q) => q.category === args.category);
        }
        // Record that we prompted
        await profileManager.recordOnboardingPrompt();
        return {
            content: [
                {
                    type: 'text',
                    text: questions.length > 0
                        ? JSON.stringify(questions, null, 2)
                        : 'No pending onboarding questions. Profile is complete or recently prompted.',
                },
            ],
        };
    });
    server.tool('analyze_codebase_for_profile', 'Analyze current directory to infer tech preferences', {
        cwd: zod_1.z.string().optional().describe('Directory to analyze (default: current working directory)'),
    }, async (args) => {
        const cwd = args.cwd || process.cwd();
        const profile = await profileManager.load();
        const inferences = await inferenceEngine.detectFromCodebase(cwd, profile);
        if (inferences.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'No new preferences detected from codebase analysis.',
                    },
                ],
            };
        }
        // Store all as pending inferences
        const storedInferences = [];
        for (const inf of inferences) {
            const stored = await profileManager.addInference(inf);
            storedInferences.push(stored);
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: `Detected ${storedInferences.length} potential preferences. Ask user to confirm each.`,
                        inferences: storedInferences.map((i) => ({
                            id: i.id,
                            field: i.field,
                            value: i.value,
                            evidence: i.evidence,
                            confidence: i.confidence,
                        })),
                    }, null, 2),
                },
            ],
        };
    });
    server.tool('get_profile_history', 'Get profile change history from Mem0 (shows how profile evolved over time)', {
        since: zod_1.z.string().optional().describe('ISO date string to filter history from (e.g., "2024-01-01")'),
        limit: zod_1.z.number().optional().describe('Maximum snapshots to return (default: 10)'),
    }, async (args) => {
        const since = args.since ? new Date(args.since) : undefined;
        const limit = args.limit || 10;
        const snapshots = await profileManager.getHistory(since, limit);
        if (snapshots.length === 0) {
            const reason = mem0Client
                ? 'No profile history found in Mem0.'
                : 'Profile history requires Mem0 configuration.';
            return {
                content: [
                    {
                        type: 'text',
                        text: reason,
                    },
                ],
            };
        }
        const formatted = snapshots.map((s) => ({
            timestamp: s.timestamp,
            identity: s.profile.identity,
            technical: {
                languages: s.profile.technical.languages,
                frameworks: s.profile.technical.frameworks,
            },
            workingStyle: s.profile.workingStyle,
        }));
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: `Found ${snapshots.length} profile snapshot(s)`,
                        snapshots: formatted,
                    }, null, 2),
                },
            ],
        };
    });
    // --- Activity Summary Tools ---
    server.tool('get_memory_timeline', 'Get memories grouped by time period for temporal analysis', {
        scope: zod_1.z.string().optional().describe('Filter by scope'),
        start: zod_1.z.string().optional().describe('Start date (ISO format)'),
        end: zod_1.z.string().optional().describe('End date (ISO format)'),
        group_by: zod_1.z.enum(['day', 'week', 'month']).optional().describe('How to group results'),
    }, async (args) => {
        const start = args.start ? new Date(args.start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
        const end = args.end ? new Date(args.end) : new Date();
        const scope = args.scope || 'global';
        const groupBy = args.group_by || 'day';
        const memories = localStore.getByDateRange(scope, start, end);
        if (memories.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `No memories found for ${scope} between ${start.toISOString().split('T')[0]} and ${end.toISOString().split('T')[0]}`,
                    },
                ],
            };
        }
        // Group memories by period
        const groups = {};
        for (const m of memories) {
            const date = m.created_at;
            let key;
            if (groupBy === 'day') {
                key = date.toISOString().split('T')[0];
            }
            else if (groupBy === 'week') {
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                key = `Week of ${weekStart.toISOString().split('T')[0]}`;
            }
            else {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }
            if (!groups[key])
                groups[key] = [];
            groups[key].push(m);
        }
        // Format output
        const formatted = Object.entries(groups)
            .sort((a, b) => b[0].localeCompare(a[0])) // Newest first
            .map(([period, mems]) => ({
            period,
            count: mems.length,
            memories: mems.slice(0, 5).map((m) => ({
                content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
                tags: m.tags,
            })),
        }));
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        scope,
                        period: `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
                        total_memories: memories.length,
                        grouped_by: groupBy,
                        groups: formatted,
                    }, null, 2),
                },
            ],
        };
    });
    server.tool('get_activity_summaries', 'Get stored activity summaries for a scope', {
        scope: zod_1.z.string().optional().describe('Filter by scope'),
        since: zod_1.z.string().optional().describe('Filter by date (ISO format)'),
        limit: zod_1.z.number().optional().describe('Maximum summaries to return'),
    }, async (args) => {
        if (!mem0Client) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Activity summaries require Mem0 configuration.',
                    },
                ],
            };
        }
        const since = args.since ? new Date(args.since) : undefined;
        const summaries = await mem0Client.getSummaries(args.scope, since, args.limit || 10);
        if (summaries.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: args.scope
                            ? `No activity summaries found for ${args.scope}.`
                            : 'No activity summaries found.',
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: `Found ${summaries.length} activity summary(ies)`,
                        summaries: summaries.map((s) => ({
                            scope: s.scope,
                            period: `${s.periodStart.split('T')[0]} to ${s.periodEnd.split('T')[0]}`,
                            memory_count: s.memoryCount,
                            content: s.content,
                        })),
                    }, null, 2),
                },
            ],
        };
    });
    server.tool('trigger_summary', 'Manually trigger an activity summary for a scope', {
        scope: zod_1.z.string().describe('Scope to summarize (e.g., "global" or "project:my-project")'),
    }, async (args) => {
        const summary = await summaryManager.triggerSummary(args.scope);
        if (!summary) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `No memories found for ${args.scope} to summarize.`,
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Summary generated successfully',
                        summary: {
                            scope: summary.scope,
                            period: `${summary.periodStart.split('T')[0]} to ${summary.periodEnd.split('T')[0]}`,
                            memory_count: summary.memoryCount,
                            content: summary.content,
                            stored_in_mem0: !!summary.mem0Id,
                        },
                    }, null, 2),
                },
            ],
        };
    });
    server.tool('get_memory_stats', 'Get memory statistics for health checks (counts by scope, tag, and date range)', {}, async () => {
        const localStats = localStore.getStats();
        // Get Mem0 stats if configured
        let mem0Stats = null;
        let profileSnapshots = 0;
        if (mem0Client) {
            try {
                // Parallel fetch - allMem0 gets everything, others get partitioned data
                const [allMem0, profileMem0, perplexityMem0] = await Promise.all([
                    mem0Client.getAll(),
                    mem0Client.getAll({ agentId: 'profile-mgr' }),
                    mem0Client.getAll({ agentId: 'perplexity' }),
                ]);
                const total = allMem0.length;
                const profileCount = profileMem0.length;
                const perplexityCount = perplexityMem0.length;
                // Regular memories = total minus partitioned
                const sharedMemoryCount = total - profileCount - perplexityCount;
                mem0Stats = {
                    total,
                    by_agent: {
                        'shared-memory': sharedMemoryCount,
                        'profile-mgr': profileCount,
                        'perplexity': perplexityCount,
                    },
                };
                profileSnapshots = profileCount;
            }
            catch (error) {
                console.error('[shared-memory] Failed to get Mem0 stats:', error);
            }
        }
        const stats = {
            local: localStats,
            mem0: mem0Stats,
            health: {
                profile_snapshots: profileSnapshots,
                mem0_configured: !!mem0Client,
            },
        };
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(stats, null, 2),
                },
            ],
        };
    });
    // --- Chess Timer Tools ---
    server.tool('start_work_session', 'Start tracking time for a coding session. Returns estimate if similar work exists.', {
        feature_id: zod_1.z.string().optional().describe('Branch name or feature identifier'),
        description: zod_1.z.string().optional().describe('What you are building'),
        work_type: zod_1.z.enum(['feature', 'bugfix', 'refactor', 'docs', 'other']).optional().describe('Type of work'),
        scope: zod_1.z.string().optional().describe('Project scope'),
    }, async (args) => {
        const scope = args.scope || (0, core_1.detectScope)();
        const feature_id = args.feature_id || `work-${Date.now()}`;
        const description = args.description || 'Coding session';
        // Check for existing active session
        const existing = sessionStore.getActiveSession(scope);
        if (existing) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Session already active',
                            session: {
                                id: existing.id,
                                feature_id: existing.feature_id,
                                status: existing.status,
                                total_active_seconds: existing.total_active_seconds,
                            },
                        }, null, 2),
                    }],
            };
        }
        // Create new session
        const session = sessionStore.createSession({
            feature_id,
            description,
            scope,
            work_type: args.work_type,
        });
        // Get estimate for similar work
        const estimate = predictor.getEstimate({
            work_type: args.work_type,
            description,
        });
        // Emit memory for cross-plugin visibility
        localStore.add({
            content: `Started work session: ${description} (${feature_id})`,
            scope,
            tags: ['chess-timer', 'session-start', args.work_type || 'other'],
        });
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Session started',
                        session: {
                            id: session.id,
                            feature_id: session.feature_id,
                            description: session.feature_description,
                            started_at: session.started_at.toISOString(),
                        },
                        estimate: estimate.sample_count > 0 ? {
                            message: estimate.message,
                            confidence: estimate.confidence,
                            similar_count: estimate.sample_count,
                        } : null,
                    }, null, 2),
                }],
        };
    });
    server.tool('get_active_session', 'Get the current active or paused work session', {
        scope: zod_1.z.string().optional().describe('Project scope (auto-detects if omitted)'),
    }, async (args) => {
        const scope = args.scope || (0, core_1.detectScope)();
        const session = sessionStore.getActiveSession(scope);
        if (!session) {
            return {
                content: [{
                        type: 'text',
                        text: 'No active session.',
                    }],
            };
        }
        const segments = sessionStore.getSegments(session.id);
        const currentSeconds = session.status === 'active'
            ? session.total_active_seconds + Math.floor((Date.now() - segments[segments.length - 1].started_at.getTime()) / 1000)
            : session.total_active_seconds;
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        session: {
                            id: session.id,
                            feature_id: session.feature_id,
                            description: session.feature_description,
                            status: session.status,
                            started_at: session.started_at.toISOString(),
                            total_active_seconds: currentSeconds,
                            segment_count: segments.length,
                        },
                    }, null, 2),
                }],
        };
    });
    server.tool('pause_work_session', 'Pause the current work session (ends current segment)', {
        session_id: zod_1.z.string().optional().describe('Session ID (uses active if omitted)'),
        reason: zod_1.z.enum(['context_switch', 'break', 'end_of_day', 'unknown']).optional().describe('Why pausing'),
    }, async (args) => {
        try {
            const scope = (0, core_1.detectScope)();
            const session = args.session_id
                ? sessionStore.getSession(args.session_id)
                : sessionStore.getActiveSession(scope);
            if (!session) {
                return {
                    content: [{ type: 'text', text: 'No active session to pause.' }],
                };
            }
            if (session.status !== 'active') {
                return {
                    content: [{ type: 'text', text: `Session is already ${session.status}.` }],
                };
            }
            const paused = sessionStore.pauseSession(session.id, args.reason || 'unknown');
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Session paused',
                            session: {
                                id: paused.id,
                                feature_id: paused.feature_id,
                                total_active_seconds: paused.total_active_seconds,
                            },
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    }],
            };
        }
    });
    server.tool('resume_work_session', 'Resume a paused work session', {
        session_id: zod_1.z.string().optional().describe('Session ID (finds paused session if omitted)'),
    }, async (args) => {
        try {
            const scope = (0, core_1.detectScope)();
            const session = args.session_id
                ? sessionStore.getSession(args.session_id)
                : sessionStore.getActiveSession(scope);
            if (!session) {
                return {
                    content: [{ type: 'text', text: 'No paused session to resume.' }],
                };
            }
            if (session.status !== 'paused') {
                return {
                    content: [{ type: 'text', text: `Session is ${session.status}, not paused.` }],
                };
            }
            const resumed = sessionStore.resumeSession(session.id);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Session resumed',
                            session: {
                                id: resumed.id,
                                feature_id: resumed.feature_id,
                                total_active_seconds: resumed.total_active_seconds,
                            },
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    }],
            };
        }
    });
    server.tool('complete_work_session', 'Complete a work session and record final metrics', {
        session_id: zod_1.z.string().optional().describe('Session ID (uses active if omitted)'),
        satisfaction: zod_1.z.number().min(1).max(5).optional().describe('How well it went (1-5)'),
        notes: zod_1.z.string().optional().describe('Learnings or blockers'),
        files_touched: zod_1.z.number().optional().describe('Number of files modified'),
        lines_added: zod_1.z.number().optional().describe('Lines of code added'),
        lines_removed: zod_1.z.number().optional().describe('Lines of code removed'),
        complexity_rating: zod_1.z.number().min(1).max(5).optional().describe('Complexity (1-5)'),
        work_type: zod_1.z.enum(['feature', 'bugfix', 'refactor', 'docs', 'other']).optional().describe('Type of work'),
    }, async (args) => {
        try {
            const scope = (0, core_1.detectScope)();
            const session = args.session_id
                ? sessionStore.getSession(args.session_id)
                : sessionStore.getActiveSession(scope);
            if (!session) {
                return {
                    content: [{ type: 'text', text: 'No active session to complete.' }],
                };
            }
            if (session.status === 'completed') {
                return {
                    content: [{ type: 'text', text: 'Session already completed.' }],
                };
            }
            const completed = sessionStore.completeSession(session.id, {
                satisfaction: args.satisfaction,
                notes: args.notes,
                metrics: {
                    files_touched: args.files_touched,
                    lines_added: args.lines_added,
                    lines_removed: args.lines_removed,
                    complexity_rating: args.complexity_rating,
                    work_type: args.work_type,
                },
            });
            // Emit memory for cross-plugin visibility
            const minutes = Math.round(completed.total_active_seconds / 60);
            localStore.add({
                content: `Completed: ${completed.feature_description} (${completed.feature_id}) - ${minutes} minutes`,
                scope: completed.scope,
                tags: ['chess-timer', 'session-complete', args.work_type || 'other'],
            });
            // Get comparison to similar sessions
            const estimate = predictor.getEstimate({ work_type: args.work_type });
            let comparison = '';
            if (estimate.sample_count > 0 && estimate.min_seconds > 0) {
                const avgSimilar = (estimate.min_seconds + estimate.max_seconds) / 2;
                const diff = ((completed.total_active_seconds - avgSimilar) / avgSimilar) * 100;
                if (diff < -10) {
                    comparison = `About ${Math.abs(Math.round(diff))}% faster than similar work.`;
                }
                else if (diff > 10) {
                    comparison = `About ${Math.round(diff)}% slower than similar work.`;
                }
                else {
                    comparison = 'Right in line with similar work.';
                }
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Session completed',
                            session: {
                                id: completed.id,
                                feature_id: completed.feature_id,
                                description: completed.feature_description,
                                total_active_seconds: completed.total_active_seconds,
                                total_minutes: minutes,
                                satisfaction: completed.satisfaction,
                            },
                            comparison: comparison || null,
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    }],
            };
        }
    });
    // Connect transport
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('[shared-memory] MCP server running on stdio');
}
main().catch((error) => {
    console.error('[shared-memory] Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
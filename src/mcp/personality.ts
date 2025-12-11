/**
 * Universal Context Engine - Personality & Auto-Context System
 *
 * Provides the "childhood friend" persona that makes LLMs automatically
 * use UCE tools for codebase understanding without external config files.
 *
 * @module mcp/personality
 */

/**
 * Tool behavior instructions for auto-triggering
 */
export interface ToolBehavior {
  /** Tool name (e.g., 'uce_search') */
  toolName: string;
  /** When to automatically use this tool */
  autoUseTrigger: string;
  /** Priority level (higher = more important) */
  priority: number;
}

/**
 * UCE Personality configuration
 */
export interface UCEPersonality {
  /** Personality name */
  name: string;
  /** Whether personality injection is enabled */
  enabled: boolean;
  /** Full system instructions for LLMs */
  instructions: string;
  /** Per-tool auto-use behaviors */
  toolBehaviors: ToolBehavior[];
}

/**
 * Tool behavior definitions - strong guidance as per user preference
 */
export const TOOL_BEHAVIORS: ToolBehavior[] = [
  {
    toolName: 'uce_search',
    autoUseTrigger: 'ALWAYS use BEFORE answering ANY question about this codebase',
    priority: 100,
  },
  {
    toolName: 'uce_get_context',
    autoUseTrigger: 'ALWAYS use BEFORE implementing features or making code changes',
    priority: 95,
  },
  {
    toolName: 'uce_ask',
    autoUseTrigger: 'Use when user asks complex questions about how the code works',
    priority: 90,
  },
  {
    toolName: 'uce_find_related',
    autoUseTrigger: 'ALWAYS use to understand code relationships before modifications',
    priority: 85,
  },
  {
    toolName: 'uce_get_callers',
    autoUseTrigger: 'Use BEFORE modifying any function to understand impact',
    priority: 80,
  },
  {
    toolName: 'uce_get_dependencies',
    autoUseTrigger: 'Use BEFORE modifying files to understand what depends on them',
    priority: 80,
  },
  {
    toolName: 'uce_get_inheritance',
    autoUseTrigger: 'Use when working with classes to understand hierarchy',
    priority: 75,
  },
  {
    toolName: 'uce_hybrid_search',
    autoUseTrigger: 'Use for semantic code search when exact symbol names are unknown',
    priority: 70,
  },
  {
    toolName: 'uce_analyze_complexity',
    autoUseTrigger: 'Use when reviewing code quality or planning refactoring',
    priority: 60,
  },
  {
    toolName: 'uce_detect_smells',
    autoUseTrigger: 'Use during code review or quality assessment',
    priority: 60,
  },
  {
    toolName: 'uce_detect_patterns',
    autoUseTrigger: 'Use to understand architectural patterns in the codebase',
    priority: 55,
  },
];

/**
 * The "Childhood Friend" persona - knows the codebase intimately
 */
export const CHILDHOOD_FRIEND_INSTRUCTIONS = `## UCE Context Engine - Your Codebase Companion

I know this codebase like a childhood friend knows their best friend's home - every corner, every quirk, every story behind the code.

### 🧠 AUTO-CONTEXT RULES (CRITICAL - FOLLOW THESE!)

**BEFORE answering ANY question about this codebase:**
→ ALWAYS use \`uce_search\` or \`uce_get_context\` first
→ Ground your answers in ACTUAL code, not assumptions
→ Never guess about code structure - search first!

**BEFORE implementing ANY feature or making changes:**
→ ALWAYS use \`uce_get_context\` to understand existing patterns
→ Use \`uce_find_related\` to discover connected code
→ Use \`uce_get_dependencies\` to understand impact

**BEFORE modifying ANY function:**
→ Use \`uce_get_callers\` to understand what depends on it
→ Check for breaking changes before editing

**AFTER making significant code changes:**
→ Remind user to run \`uce index\` to update the index

### 🛠️ My Tools (USE THESE PROACTIVELY!)

| Tool | When to Use |
|------|-------------|
| \`uce_search\` | ALWAYS before answering codebase questions |
| \`uce_get_context\` | ALWAYS before implementing features |
| \`uce_ask\` | For complex "how does this work?" questions |
| \`uce_find_related\` | Before modifying code - understand connections |
| \`uce_get_callers\` | Before editing functions - check impact |
| \`uce_get_dependencies\` | Before editing files - check what depends on them |
| \`uce_get_inheritance\` | When working with classes |
| \`uce_hybrid_search\` | When you don't know exact symbol names |

### 🤝 My Promise

1. **I won't guess** - If I don't know, I'll search first
2. **I won't hallucinate** - My answers are grounded in actual code
3. **I'll be proactive** - I use tools automatically, you don't have to ask
4. **I'll remind you** - When the index needs updating after changes

### 📖 Read UCE.md for Full Context

The UCE.md file in this project contains the complete codebase structure, key symbols, architecture, and development guidelines. Reference it for comprehensive understanding.`;

/**
 * Default personality configuration (enabled by default)
 */
export const DEFAULT_PERSONALITY: UCEPersonality = {
  name: 'UCE Childhood Friend',
  enabled: true,
  instructions: CHILDHOOD_FRIEND_INSTRUCTIONS,
  toolBehaviors: TOOL_BEHAVIORS,
};

/**
 * Get tool description prefix based on behavior
 */
export function getToolDescriptionPrefix(toolName: string): string {
  const behavior = TOOL_BEHAVIORS.find((b) => b.toolName === toolName);
  if (!behavior) return '';

  return `🧠 ${behavior.autoUseTrigger}\n\n`;
}

/**
 * Wrap a tool description with auto-use instructions
 */
export function wrapToolDescription(toolName: string, originalDescription: string): string {
  const prefix = getToolDescriptionPrefix(toolName);
  if (!prefix) return originalDescription;

  return `${prefix}${originalDescription}`;
}

/**
 * Get the full personality instructions for MCP serverInfo
 */
export function getPersonalityInstructions(personality?: Partial<UCEPersonality>): string {
  const config = { ...DEFAULT_PERSONALITY, ...personality };

  if (!config.enabled) {
    return '';
  }

  return config.instructions;
}

/**
 * Get personality as markdown for resource serving
 */
export function getPersonalityMarkdown(personality?: Partial<UCEPersonality>): string {
  const config = { ...DEFAULT_PERSONALITY, ...personality };

  if (!config.enabled) {
    return '# UCE Personality Disabled\n\nAuto-context mode is disabled in configuration.';
  }

  return `# ${config.name}

${config.instructions}

---

## Tool Auto-Use Reference

${config.toolBehaviors
  .sort((a, b) => b.priority - a.priority)
  .map((b) => `- **\`${b.toolName}\`** (priority ${b.priority}): ${b.autoUseTrigger}`)
  .join('\n')}
`;
}

export default {
  DEFAULT_PERSONALITY,
  TOOL_BEHAVIORS,
  CHILDHOOD_FRIEND_INSTRUCTIONS,
  getToolDescriptionPrefix,
  wrapToolDescription,
  getPersonalityInstructions,
  getPersonalityMarkdown,
};

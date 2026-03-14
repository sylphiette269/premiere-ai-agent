export interface AgentErrorCode {
  code: string;
  retryable: boolean;
  category: 'bridge' | 'premiere' | 'agent' | 'validation' | 'style';
}

export const AGENT_ERROR_CODES = {
  BRIDGE_TIMEOUT: {
    code: 'BRIDGE_TIMEOUT',
    retryable: true,
    category: 'bridge',
  },
  BRIDGE_EXPIRED: {
    code: 'BRIDGE_EXPIRED',
    retryable: true,
    category: 'bridge',
  },
  BRIDGE_NOT_CONNECTED: {
    code: 'BRIDGE_NOT_CONNECTED',
    retryable: true,
    category: 'bridge',
  },
  PREMIERE_SCRIPT_ERR: {
    code: 'PREMIERE_SCRIPT_ERR',
    retryable: false,
    category: 'premiere',
  },
  INVALID_CLIP_ID: {
    code: 'INVALID_CLIP_ID',
    retryable: false,
    category: 'premiere',
  },
  INVALID_SEQUENCE_ID: {
    code: 'INVALID_SEQUENCE_ID',
    retryable: false,
    category: 'premiere',
  },
  TRANSITION_UNSAFE: {
    code: 'TRANSITION_UNSAFE',
    retryable: false,
    category: 'premiere',
  },
  ASSEMBLY_BLOCKED: {
    code: 'ASSEMBLY_BLOCKED',
    retryable: false,
    category: 'agent',
  },
  MISSING_INPUT: {
    code: 'MISSING_INPUT',
    retryable: false,
    category: 'agent',
  },
  PROJECT_STATE_INVALID: {
    code: 'PROJECT_STATE_INVALID',
    retryable: false,
    category: 'agent',
  },
  TOOL_DISABLED: {
    code: 'TOOL_DISABLED',
    retryable: false,
    category: 'agent',
  },
  DEPENDENCY_FAILED: {
    code: 'DEPENDENCY_FAILED',
    retryable: false,
    category: 'agent',
  },
  RESEARCH_GATE_FAILED: {
    code: 'RESEARCH_GATE_FAILED',
    retryable: false,
    category: 'agent',
  },
  VERIFICATION_FAILED: {
    code: 'VERIFICATION_FAILED',
    retryable: false,
    category: 'validation',
  },
  CRITIC_FAILED: {
    code: 'CRITIC_FAILED',
    retryable: false,
    category: 'validation',
  },
  STYLE_MISMATCH: {
    code: 'STYLE_MISMATCH',
    retryable: false,
    category: 'style',
  },
  UNKNOWN: {
    code: 'UNKNOWN',
    retryable: false,
    category: 'agent',
  },
} as const satisfies Record<string, AgentErrorCode>;

export type AgentErrorCodeKey = keyof typeof AGENT_ERROR_CODES;

export interface AgentError {
  ok: false;
  error_code: string;
  message: string;
  retryable: boolean;
  category: AgentErrorCode['category'];
  details?: {
    source?: string;
    rawMessage?: string;
    toolName?: string;
    stepId?: string;
    [key: string]: unknown;
  };
}

export function buildAgentError(
  codeKey: AgentErrorCodeKey,
  message: string,
  details?: AgentError['details'],
): AgentError {
  const definition = AGENT_ERROR_CODES[codeKey];

  return {
    ok: false,
    error_code: definition.code,
    message,
    retryable: definition.retryable,
    category: definition.category,
    details,
  };
}

export function classifyError(rawMessage: string, toolName?: string): AgentErrorCodeKey {
  const message = String(rawMessage ?? '').toLowerCase();
  const tool = String(toolName ?? '').toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'BRIDGE_TIMEOUT';
  }
  if (message.includes('expired') || message.includes('command_expired')) {
    return 'BRIDGE_EXPIRED';
  }
  if (message.includes('not connected') || message.includes('connection')) {
    return 'BRIDGE_NOT_CONNECTED';
  }
  if (
    message.includes('script error') ||
    message.includes('extendscript') ||
    message.includes('evalscript')
  ) {
    return 'PREMIERE_SCRIPT_ERR';
  }
  if (
    message.includes('clip not found') ||
    (message.includes('clipid') && message.includes('invalid'))
  ) {
    return 'INVALID_CLIP_ID';
  }
  if (
    message.includes('sequence not found') ||
    (message.includes('sequenceid') && message.includes('invalid'))
  ) {
    return 'INVALID_SEQUENCE_ID';
  }
  if (message.includes('gap') || message.includes('overlap')) {
    return 'TRANSITION_UNSAFE';
  }
  if (message.includes('blocked')) {
    return 'ASSEMBLY_BLOCKED';
  }
  if (message.includes('missing') || message.includes('not exist')) {
    return 'MISSING_INPUT';
  }
  if (message.includes('disabled') || tool === 'build_timeline_from_xml') {
    return 'TOOL_DISABLED';
  }

  return 'UNKNOWN';
}

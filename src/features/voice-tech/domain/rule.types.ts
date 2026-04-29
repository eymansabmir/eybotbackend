import type { RoutingConditionNode } from './condition.types';

export interface Action {
  type: 'VOICE_PROVIDER';
  voiceProvider: string;
  telephonyProvider: string;
  voiceCredentialId: string;
  telephonyCredentialId: string;
  channel: 'telephony' | 'whatsapp';
  agentId: string;
  mode?: 'single' | 'batch';
  runtimeConfig?: Record<string, any>;
}

export interface Rule {
  ruleId: string;
  voiceProviderId: string | null;
  priority: number;
  conditions: RoutingConditionNode;
  action: Action;
}

export interface RoutingConfig {
  id: string;
  tenantId: string;
  name: string;
  rules: Rule[];
}

export interface RoutingExecutionInput {
  tenantId: string;
  routingConfigId: string;
  attributes: Record<string, unknown>;
  entityId?: string;
  entityType?: string; // Optional: used to prefix attributes for mixed-entity rules
  userId?: string;
  phone?: string;
  executeProvider?: boolean;
  traceId?: string;
  preloadedConfig?: any; // Optimized for bulk execution
  skipIntermediateEvents?: boolean; // Reduce DB noise in bulk mode
  preloadedCredentials?: Record<string, any>; // Cache for provider secrets
}

export interface RoutingActionResult {
  accepted: boolean;
  providerReference?: string;
  message?: string;
}

export type RoutingAction = Action;

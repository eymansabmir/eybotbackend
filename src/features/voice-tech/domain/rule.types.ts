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
  entityType?: string; // Optional: used to prefix attributes for mixed-entity rules
  userId?: string;
  phone?: string;
  executeProvider?: boolean;
  traceId?: string;
}

export interface RoutingActionResult {
  accepted: boolean;
  providerReference?: string;
  message?: string;
}

export type RoutingAction = Action;

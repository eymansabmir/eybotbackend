import type { RoutingConditionNode } from './condition.types';

export interface Action {
  type: 'VOICE_PROVIDER';
  provider: string;
  agentId: string;
  mode?: 'single' | 'batch';
  transport?: 'telephony' | 'whatsapp';
  config?: Record<string, any>;
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
}

export interface RoutingActionResult {
  accepted: boolean;
  providerReference?: string;
  message?: string;
}

export type RoutingAction = Action;

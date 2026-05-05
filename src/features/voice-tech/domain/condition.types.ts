export type Operator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | '<'
  | '>'
  | '<='
  | '>='
  | 'contains';

export interface ConditionLeaf {
  field: string;
  operator: Operator;
  value: unknown;
}

export interface ConditionGroup {
  operator: 'AND' | 'OR';
  children: Array<ConditionGroup | ConditionLeaf>;
}

export type RoutingConditionNode = ConditionGroup | ConditionLeaf;

import type { SessionEntity } from '../../features/session/session.entity';
import type { ContactInfo } from './engine.interface';
import type { FlowEntity } from '../../features/flow/flow.entity';

export interface VariableContext {
  session: SessionEntity;
  contact: ContactInfo;
  flow: FlowEntity;
}

export class VariableResolver {
  private static readonly PATTERN = /\{\{([^}]+)\}\}/g;

  resolve(template: string, context: VariableContext): string {
    return template.replace(VariableResolver.PATTERN, (_match, path: string) => {
      const value = this.resolvePath(path.trim(), context);
      return value !== undefined && value !== null ? String(value) : _match;
    });
  }

  resolveExpression(expression: string, context: VariableContext): unknown {
    const trimmed = expression.trim();
    const normalized =
      trimmed.startsWith('{{') && trimmed.endsWith('}}')
        ? trimmed.slice(2, -2).trim()
        : trimmed;
    return this.resolvePath(normalized, context);
  }

  private resolvePath(path: string, context: VariableContext): unknown {
    const parts = path.split('.');
    const scope = parts[0];

    if (scope === 'system') return this.resolveSystem(parts[1]);
    if (scope === 'session') {
      if (parts.length === 2 && parts[1] === 'id') return context.session.id;
      return this.nested(parts.slice(1), context.session.variables);
    }
    if (scope === 'contact') {
      if (parts[1] === 'customFields') return this.nested(parts.slice(2), context.contact.customFields);
      
      // Fallback: Check if it's a direct property of contact (waId, name) or a custom field
      const direct = this.nested(parts.slice(1), context.contact as unknown as Record<string, unknown>);
      if (direct !== undefined) return direct;
      
      return this.nested(parts.slice(1), context.contact.customFields);
    }
    if (scope === 'flow') return this.nested(parts.slice(1), context.flow as unknown as Record<string, unknown>);
    return undefined;
  }

  private resolveSystem(variable: string | undefined): unknown {
    const now = new Date();
    switch (variable) {
      case 'now': return now.toISOString();
      case 'date': return now.toISOString().split('T')[0];
      case 'timestamp': return now.getTime();
      default: return undefined;
    }
  }

  private nested(parts: string[], obj: unknown): unknown {
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}

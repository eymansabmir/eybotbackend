import { Session } from '../schemas/session.schema';
import { Contact } from '../schemas/contact.schema';
import { Flow } from '../schemas/flow.schema';

export interface VariableContext {
  session: Session;
  contact: Contact;
  flow: Flow;
}

export class VariableResolver {
  private static readonly VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

  resolve(template: string, context: VariableContext): string {
    return template.replace(VariableResolver.VARIABLE_PATTERN, (match, path) => {
      const value = this.resolvePath(path.trim(), context);
      return value !== undefined && value !== null ? String(value) : match;
    });
  }

  resolveExpression(expression: string, context: VariableContext): any {
    const trimmed = expression.trim();
    const normalized = trimmed.startsWith('{{') && trimmed.endsWith('}}')
      ? trimmed.slice(2, -2).trim()
      : trimmed;
    return this.resolvePath(normalized, context);
  }

  private resolvePath(path: string, context: VariableContext): any {
    const parts = path.split('.');
    const scope = parts[0];

    if (scope === 'system') {
      const systemVar = parts[1];
      return systemVar ? this.resolveSystemVariable(systemVar) : undefined;
    }

    if (scope === 'session') {
      return this.resolveNestedPath(parts.slice(1), context.session.variables);
    }

    if (scope === 'contact') {
      if (parts[1] === 'customFields') {
        return this.resolveNestedPath(parts.slice(2), context.contact.customFields);
      }
      return this.resolveNestedPath(parts.slice(1), context.contact);
    }

    if (scope === 'flow') {
      return this.resolveNestedPath(parts.slice(1), context.flow);
    }

    return undefined;
  }

  private resolveSystemVariable(variable: string): any {
    const now = new Date();
    
    switch (variable) {
      case 'now':
        return now.toISOString();
      case 'date':
        return now.toISOString().split('T')[0];
      case 'timestamp':
        return now.getTime();
      default:
        return undefined;
    }
  }

  private resolveNestedPath(parts: string[], obj: any): any {
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
}

import { VariableContext } from './variable-resolver';
import { VariableResolver } from './variable-resolver';
import * as vm from 'vm';

export type MutationStrategy = (value: string, systemVariable: string | undefined, ctx: VariableContext, resolver: VariableResolver) => unknown;

export const MUTATION_STRATEGIES: Record<string, MutationStrategy> = {
  system: (_v, sv, ctx, resolver) => {
    const sysVar = sv || '';
    const resolved = resolver.resolve(`{{${sysVar}}}`, ctx);
    return resolved === `{{${sysVar}}}` ? '' : resolved;
  },
  
  variable: (v, _sv, ctx, resolver) => {
    const varName = v || '';
    const resolvedSession = resolver.resolve(`{{session.${varName}}}`, ctx);
    if (resolvedSession !== `{{session.${varName}}}`) return resolvedSession;
    
    const resolvedContact = resolver.resolve(`{{contact.${varName}}}`, ctx);
    return resolvedContact !== `{{contact.${varName}}}` ? resolvedContact : '';
  },
  
  random_number: (v) => {
    const parts = (v || '1-100').split('-');
    const min = parseInt(parts[0]?.trim() || '1') || 1;
    const max = parseInt(parts[1]?.trim() || '100') || 100;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  
  random_string: (v) => {
    const length = parseInt(v) || 8;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  
  clear: () => "",
  
  date: (v, _sv, _ctx, _resolver) => {
    const format = v || 'ISO';
    const now = new Date();
    return format === 'ISO' ? now.toISOString() : now.toLocaleString();
  },
  
  expression: (v, _sv, ctx, resolver) => {
    const expression = v || '';
    try {
      const resolvedExpr = resolver.resolve(expression, ctx);
      // Execute in a sandboxed V8 context instead of eval
      const safeExpr = resolvedExpr.replace(/[^0-9+\-*/().\s]/g, '');
      const script = new vm.Script(safeExpr);
      return script.runInNewContext({}, { timeout: 100 });
    } catch (e) {
      return expression;
    }
  },
  
  value: (v, _sv, ctx, resolver) => {
    return resolver.resolve(v || '', ctx);
  }
};

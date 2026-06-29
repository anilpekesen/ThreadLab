import type { ConditionalRule } from '@/types';

export interface RuleContext {
  selectedColor: string;
  selectedVariant: { selectedOptions?: { name: string; value: string }[] } | null | undefined;
}

export interface RuleResult {
  ruleId: string;
  name: string;
  action: ConditionalRule['then']['action'];
  message: string;
}

function evaluateCondition(rule: ConditionalRule, ctx: RuleContext): boolean {
  const { field, op, value, optionName } = rule.when;

  let fieldValue = '';
  if (field === 'color') {
    fieldValue = ctx.selectedColor;
  } else if (field === 'variantOption') {
    fieldValue =
      ctx.selectedVariant?.selectedOptions?.find(
        (o) => o.name.toLowerCase() === (optionName ?? '').toLowerCase(),
      )?.value ?? '';
  }

  const v = (value ?? '').toLowerCase();
  const f = fieldValue.toLowerCase();

  switch (op) {
    case 'eq':       return f === v;
    case 'neq':      return f !== v;
    case 'contains': return f.includes(v);
    default:         return false;
  }
}

/**
 * Returns only the rules whose conditions match the current context.
 * Disabled rules are skipped.
 */
export function evaluateRules(
  rules: ConditionalRule[] | undefined,
  ctx: RuleContext,
): RuleResult[] {
  if (!rules?.length) return [];
  return rules
    .filter((r) => r.enabled)
    .filter((r) => evaluateCondition(r, ctx))
    .map((r) => ({
      ruleId: r.id,
      name: r.name,
      action: r.then.action,
      message: r.then.message,
    }));
}

/** Filter results by action type. */
export function warnings(results: RuleResult[]): RuleResult[] {
  return results.filter((r) => r.action === 'showWarning');
}

export function blockers(results: RuleResult[]): RuleResult[] {
  return results.filter((r) => r.action === 'blockCheckout');
}

/**
 * ComfyUI workflows in API format (node id → class_type + inputs), with
 * `{{name}}` placeholders that pixel-forge fills per candidate: `prompt` (the
 * full style prompt), `subject`, `size`, `seed`, and `reference` (the uploaded
 * reference sheet). A workflow file is one complete setup: model, LoRA,
 * sampler settings and any trigger words around the placeholders.
 */

export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export type WorkflowVars = Record<string, string | number>;

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function placeholders(wf: Workflow): Set<string> {
  return new Set([...JSON.stringify(wf).matchAll(PLACEHOLDER)].map((m) => m[1]));
}

/** A copy of `wf` with placeholders filled; an input that is exactly one placeholder takes the value's type. */
export function fillWorkflow(wf: Workflow, vars: WorkflowVars): Workflow {
  const lookup = (name: string) => {
    if (!(name in vars)) {
      throw new Error(
        `The workflow uses {{${name}}}, which pixel-forge does not fill (it fills ${Object.keys(vars).join(', ')}).`,
      );
    }
    return vars[name];
  };
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = /^\{\{(\w+)\}\}$/.exec(v);
      return whole ? lookup(whole[1]) : v.replace(PLACEHOLDER, (_, name) => String(lookup(name)));
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    }
    return v;
  };
  return fill(wf) as Workflow;
}

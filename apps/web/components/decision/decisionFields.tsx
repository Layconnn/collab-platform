import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { z } from "zod";

import { createDecisionInputSchema } from "@repo/validators/decision";

// Empty optional text is kept in the form, then mapped to absent/null at the API boundary.
export const decisionDraftSchema = createDecisionInputSchema.pick({ question: true }).extend({
  outcome: z.string().max(5000),
  rationale: z.string().max(5000),
  alternatives: z.string().max(5000),
  followUp: z.string().max(2000),
});
export type DecisionDraft = z.infer<typeof decisionDraftSchema>;

export const blankDecisionDraft: DecisionDraft = {
  question: "", outcome: "", rationale: "", alternatives: "", followUp: "",
};

const fields = [
  { name: "outcome", label: "Proposed outcome", hint: "What should the team do? Required before finalization.", max: 5000 },
  { name: "rationale", label: "Rationale", hint: "Why is this the right choice? Required before finalization.", max: 5000 },
  { name: "alternatives", label: "Alternatives considered", hint: "What else was considered, and why?", max: 5000 },
  { name: "followUp", label: "Follow-up notes", hint: "Informational next steps; this is not a task assignment.", max: 2000 },
] as const;

const control = "mt-2 w-full rounded-sm border border-control-border bg-surface px-3.5 py-2.5 text-sm leading-6 text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60";

export function DecisionFields({ prefix, register, errors, disabled = false }: {
  prefix: string;
  register: UseFormRegister<DecisionDraft>;
  errors: FieldErrors<DecisionDraft>;
  disabled?: boolean;
}) {
  return <div className="space-y-4">
    <div>
      <label htmlFor={`${prefix}-question`} className="block text-sm font-semibold text-text-primary">Decision question</label>
      <p id={`${prefix}-question-help`} className="mt-1 text-xs leading-5 text-text-muted">State the choice this record should preserve.</p>
      <input id={`${prefix}-question`} {...register("question")} maxLength={240} required disabled={disabled} aria-invalid={Boolean(errors.question)} aria-describedby={errors.question ? `${prefix}-question-error` : `${prefix}-question-help`} className={`${control} min-h-11`} placeholder="Which approach should we take?" />
      {errors.question ? <p id={`${prefix}-question-error`} role="alert" className="mt-1 text-sm text-danger">Enter a question of up to 240 characters.</p> : null}
    </div>
    <div className="grid min-w-0 gap-4 md:grid-cols-2">{fields.map(({ name, label, hint, max }, index) => <div key={name} className={index < 2 ? "min-w-0 md:col-span-2" : "min-w-0"}>
      <label htmlFor={`${prefix}-${name}`} className="block text-sm font-semibold text-text-primary">{label}</label>
      <p id={`${prefix}-${name}-help`} className="mt-1 text-xs leading-5 text-text-muted">{hint}</p>
      <textarea id={`${prefix}-${name}`} {...register(name)} maxLength={max} rows={index < 2 ? 3 : 2} disabled={disabled} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${prefix}-${name}-error` : `${prefix}-${name}-help`} className={`${control} min-h-20 resize-y`} />
      {errors[name] ? <p id={`${prefix}-${name}-error`} role="alert" className="mt-1 text-sm text-danger">Keep this field within {max.toLocaleString()} characters.</p> : null}
    </div>)}</div>
  </div>;
}

export function optionalCreate(value: string) { return value.trim() || undefined; }
export function optionalEdit(value: string) { return value.trim() || null; }

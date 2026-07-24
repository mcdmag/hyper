import {createHash} from 'crypto';

import type {
  AttemptId,
  CommandPlan,
  CommandPlanOption,
  LocalRiskAssessment,
  NliApprovalRequest,
  NliDisplayOption,
  NliEditRequest,
  NliErrorCode,
  NliProviderResult,
  OptionId,
  PlanId,
  SessionUid
} from '../../typings/nli';

const FIELD_LIMITS = Object.freeze({
  id: 128,
  summary: 500,
  label: 160,
  rationale: 500,
  purpose: 240,
  assumption: 240,
  assumptions: 5,
  shellText: 4096,
  question: 500
});

interface UnknownObject {
  readonly [key: string]: unknown;
}

export interface NliApprovalIdentity {
  readonly windowId: number;
  readonly rendererId: number;
}

export interface CommandPlanBinding {
  readonly sessionUid: SessionUid;
  readonly attemptId: AttemptId;
  readonly shellIdentity: string;
  readonly cwdFingerprint: string;
  readonly submittedLine: string;
  readonly approvalIdentity: NliApprovalIdentity;
}

export type NliApprovalDecision =
  | {readonly status: 'rejected'}
  | {
      readonly status: 'confirmation-required';
      readonly risk: LocalRiskAssessment;
    }
  | {
      readonly status: 'authorized';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
      readonly planId: PlanId;
      readonly optionId: OptionId;
      readonly editRevision: number;
      readonly shellText: string;
      readonly digest: string;
      readonly risk: LocalRiskAssessment;
    };

export class NliCommandPlanError extends Error {
  readonly code: NliErrorCode = 'NLI_VALIDATION_FAILED';

  constructor() {
    super('Natural-language command plan validation failed');
    this.name = 'NliCommandPlanError';
  }
}

const validationError = () => new NliCommandPlanError();

const isObject = (value: unknown): value is UnknownObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasExactKeys = (value: UnknownObject, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const readText = (value: unknown, maximum: number): string => {
  const hasControlCharacters =
    typeof value === 'string' &&
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
    });
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim().length === 0 ||
    hasControlCharacters
  ) {
    throw validationError();
  }
  return value;
};

const readId = <T extends string>(value: unknown): T => readText(value, FIELD_LIMITS.id) as T;

const validateOption = (value: unknown): CommandPlanOption => {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['optionId', 'label', 'rationale', 'assumptions', 'purpose', 'shellText']) ||
    !Array.isArray(value.assumptions) ||
    value.assumptions.length > FIELD_LIMITS.assumptions
  ) {
    throw validationError();
  }
  const assumptions = value.assumptions.map((assumption) => readText(assumption, FIELD_LIMITS.assumption));
  return Object.freeze({
    optionId: readId<OptionId>(value.optionId),
    label: readText(value.label, FIELD_LIMITS.label),
    rationale: readText(value.rationale, FIELD_LIMITS.rationale),
    assumptions: Object.freeze(assumptions),
    purpose: readText(value.purpose, FIELD_LIMITS.purpose),
    shellText: validateShellText(value.shellText)
  });
};

export const validateShellText = (value: unknown): string => readText(value, FIELD_LIMITS.shellText);

export const validateCommandPlan = (value: unknown, maximumOptions = 3): NliProviderResult => {
  if (!isObject(value) || value.version !== 1 || (value.kind !== 'plan' && value.kind !== 'clarification')) {
    throw validationError();
  }
  if (value.kind === 'clarification') {
    if (
      !hasExactKeys(value, ['version', 'kind', 'planId', 'question', 'choices']) ||
      !Array.isArray(value.choices) ||
      value.choices.length < 2 ||
      value.choices.length > 3
    ) {
      throw validationError();
    }
    const choices = value.choices.map((choice) => {
      if (!isObject(choice) || !hasExactKeys(choice, ['optionId', 'label'])) throw validationError();
      return Object.freeze({
        optionId: readId<OptionId>(choice.optionId),
        label: readText(choice.label, FIELD_LIMITS.label)
      });
    });
    if (new Set(choices.map((choice) => choice.optionId)).size !== choices.length) throw validationError();
    return Object.freeze({
      version: 1,
      kind: 'clarification',
      planId: readId<PlanId>(value.planId),
      question: readText(value.question, FIELD_LIMITS.question),
      choices: Object.freeze(choices)
    });
  }
  const optionLimit = Math.max(1, Math.min(3, maximumOptions));
  if (
    !hasExactKeys(value, ['version', 'kind', 'planId', 'summary', 'options']) ||
    !Array.isArray(value.options) ||
    value.options.length < 1 ||
    value.options.length > optionLimit
  ) {
    throw validationError();
  }
  const options = value.options.map(validateOption);
  if (new Set(options.map((option) => option.optionId)).size !== options.length) throw validationError();
  return Object.freeze({
    version: 1,
    kind: 'plan',
    planId: readId<PlanId>(value.planId),
    summary: readText(value.summary, FIELD_LIMITS.summary),
    options: Object.freeze(options)
  });
};

interface RiskRule {
  readonly reason: string;
  readonly level: 'medium' | 'high';
  readonly pattern: RegExp;
}

const RISK_RULES: readonly RiskRule[] = Object.freeze([
  {
    reason: 'Deletes or irreversibly resets data.',
    level: 'high',
    pattern: /\b(?:Remove-Item|rm|ri|del|erase|rmdir|rd|Clear-Content)\b|\bgit\s+(?:rm\b|clean\b|reset\s+--hard)/i
  },
  {
    reason: 'Stages a broad set of repository changes.',
    level: 'medium',
    pattern: /\bgit\s+add(?:\s+--)?\s*(?:--all|-A|-u|\.|\*|:\/)(?:\s|$)/i
  },
  {
    reason: 'Requests elevated privileges.',
    level: 'high',
    pattern: /(?:^|[;&|]\s*)sudo\b|\brunas\b|Start-Process\b[^\r\n]*\b-Verb\s+RunAs\b/i
  },
  {
    reason: 'Can change remote or published state.',
    level: 'medium',
    pattern:
      /\b(?:git\s+(?:push|fetch|pull|clone)|gh\b|npm\s+(?:publish|install|update)|pnpm\s+(?:add|install|update)|yarn\s+(?:add|install|upgrade)|pip(?:3)?\s+install|winget\s+install|choco\s+install|scoop\s+install|ssh|scp|sftp|Invoke-WebRequest|Invoke-RestMethod|curl|wget)\b/i
  },
  {
    reason: 'Writes or redirects command output.',
    level: 'medium',
    pattern: /(?:^|[^>])>>?[^>]|\b(?:Out-File|Set-Content|Add-Content)\b/i
  },
  {
    reason: 'Uses encoded PowerShell input.',
    level: 'high',
    pattern: /(?:^|\s)-(?:EncodedCommand|enc)\b|FromBase64String/i
  },
  {reason: 'Evaluates dynamically constructed code.', level: 'high', pattern: /\b(?:Invoke-Expression|iex)\b/i},
  {reason: 'Combines commands through a pipeline.', level: 'medium', pattern: /(^|[^|])\|([^|]|$)/},
  {reason: 'Combines multiple command operations.', level: 'medium', pattern: /;|&&|\|\|/},
  {reason: 'Contains command obfuscation patterns.', level: 'high', pattern: /`[^\r\n]|\[char\]|\$\{[^}]+\}/i}
]);

export const classifyCommandRisk = (shellText: string): LocalRiskAssessment => {
  const reasons: string[] = [];
  let level: LocalRiskAssessment['level'] = 'low';
  for (const rule of RISK_RULES) {
    if (!rule.pattern.test(shellText)) continue;
    reasons.push(rule.reason);
    if (rule.level === 'high') level = 'high';
    else if (level === 'low') level = 'medium';
  }
  return Object.freeze({
    level,
    reasons: Object.freeze(reasons),
    requiresSecondConfirmation: level === 'high'
  });
};

interface SecretRule {
  readonly reason: string;
  readonly pattern: RegExp;
}

const SECRET_RULES: readonly SecretRule[] = Object.freeze([
  {reason: 'Looks like a private key.', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i},
  {reason: 'Looks like an OpenAI API key.', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/},
  {reason: 'Looks like a GitHub token.', pattern: /\b(?:gh[opurs]_[A-Za-z0-9]{20,})\b/i},
  {reason: 'Looks like an AWS access key.', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/},
  {reason: 'Looks like a bearer token.', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i},
  {reason: 'Looks like a JSON Web Token.', pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/},
  {
    reason: 'Looks like an assigned credential.',
    pattern: /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*[^\s;]{8,}/i
  }
]);

export const screenSecretLookingInput = (text: string) => {
  const reasons = SECRET_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.reason);
  return Object.freeze({sensitive: reasons.length > 0, reasons: Object.freeze(reasons)});
};

interface StoredOption extends CommandPlanOption {
  readonly digest: string;
  readonly risk: LocalRiskAssessment;
}

const digestOption = (binding: CommandPlanBinding, planId: PlanId, option: CommandPlanOption, editRevision: number) =>
  createHash('sha256')
    .update(
      [
        'hyper-nli-plan-v1',
        binding.sessionUid,
        binding.attemptId,
        binding.shellIdentity,
        binding.cwdFingerprint,
        binding.submittedLine,
        String(binding.approvalIdentity.windowId),
        String(binding.approvalIdentity.rendererId),
        planId,
        option.optionId,
        option.shellText,
        String(editRevision)
      ].join('\u0000'),
      'utf8'
    )
    .digest('hex');

const storeOption = (
  binding: CommandPlanBinding,
  planId: PlanId,
  option: CommandPlanOption,
  editRevision: number
): StoredOption =>
  Object.freeze({
    ...option,
    assumptions: Object.freeze([...option.assumptions]),
    risk: classifyCommandRisk(option.shellText),
    digest: digestOption(binding, planId, option, editRevision)
  });

export class ImmutableCommandPlan {
  readonly binding: CommandPlanBinding;
  readonly planId: PlanId;
  readonly summary: string;
  private options: readonly StoredOption[];
  private editRevision = 0;
  private consumed = false;
  private pendingHighRiskConfirmation?: Readonly<{
    optionId: OptionId;
    digest: string;
    editRevision: number;
    windowId: number;
    rendererId: number;
  }>;

  constructor(binding: CommandPlanBinding, plan: CommandPlan) {
    this.binding = Object.freeze({...binding, approvalIdentity: Object.freeze({...binding.approvalIdentity})});
    this.planId = plan.planId;
    this.summary = plan.summary;
    this.options = Object.freeze(plan.options.map((option) => storeOption(this.binding, this.planId, option, 0)));
  }

  get revision(): number {
    return this.editRevision;
  }

  get displayOptions(): readonly NliDisplayOption[] {
    return Object.freeze(
      this.options.map((option) =>
        Object.freeze({
          optionId: option.optionId,
          label: option.label,
          rationale: option.rationale,
          assumptions: Object.freeze([...option.assumptions]),
          purpose: option.purpose,
          commandPreview: option.shellText,
          risk: option.risk
        })
      )
    );
  }

  edit(request: NliEditRequest): boolean {
    if (
      this.consumed ||
      request.sessionUid !== this.binding.sessionUid ||
      request.attemptId !== this.binding.attemptId ||
      request.planId !== this.planId ||
      request.editRevision !== this.editRevision
    ) {
      return false;
    }
    const index = this.options.findIndex((option) => option.optionId === request.optionId);
    if (index < 0) return false;
    const shellText = validateShellText(request.shellText);
    this.editRevision++;
    this.pendingHighRiskConfirmation = undefined;
    this.options = Object.freeze(
      this.options.map((option, optionIndex) =>
        storeOption(
          this.binding,
          this.planId,
          optionIndex === index ? {...option, shellText} : option,
          this.editRevision
        )
      )
    );
    return true;
  }

  authorize(request: NliApprovalRequest, identity: NliApprovalIdentity): NliApprovalDecision {
    if (
      this.consumed ||
      this.binding.approvalIdentity.windowId !== identity.windowId ||
      this.binding.approvalIdentity.rendererId !== identity.rendererId ||
      request.sessionUid !== this.binding.sessionUid ||
      request.attemptId !== this.binding.attemptId ||
      request.planId !== this.planId ||
      request.editRevision !== this.editRevision
    ) {
      return {status: 'rejected'};
    }
    const option = this.options.find((candidate) => candidate.optionId === request.optionId);
    if (!option) return {status: 'rejected'};
    if (option.risk.requiresSecondConfirmation) {
      const pending = this.pendingHighRiskConfirmation;
      if (!pending) {
        this.pendingHighRiskConfirmation = Object.freeze({
          optionId: option.optionId,
          digest: option.digest,
          editRevision: this.editRevision,
          windowId: identity.windowId,
          rendererId: identity.rendererId
        });
        return {status: 'confirmation-required', risk: option.risk};
      }
      if (pending.windowId !== identity.windowId || pending.rendererId !== identity.rendererId) {
        return {status: 'rejected'};
      }
      if (
        pending.optionId !== option.optionId ||
        pending.digest !== option.digest ||
        pending.editRevision !== this.editRevision
      ) {
        this.pendingHighRiskConfirmation = Object.freeze({
          optionId: option.optionId,
          digest: option.digest,
          editRevision: this.editRevision,
          windowId: identity.windowId,
          rendererId: identity.rendererId
        });
        return {status: 'confirmation-required', risk: option.risk};
      }
      if (!request.highRiskConfirmation) return {status: 'confirmation-required', risk: option.risk};
    }
    this.consumed = true;
    this.pendingHighRiskConfirmation = undefined;
    return Object.freeze({
      status: 'authorized',
      sessionUid: this.binding.sessionUid,
      attemptId: this.binding.attemptId,
      planId: this.planId,
      optionId: option.optionId,
      editRevision: this.editRevision,
      shellText: option.shellText,
      digest: option.digest,
      risk: option.risk
    });
  }

  reject(sessionUid: SessionUid, attemptId: AttemptId, planId: PlanId): boolean {
    if (
      this.consumed ||
      sessionUid !== this.binding.sessionUid ||
      attemptId !== this.binding.attemptId ||
      planId !== this.planId
    ) {
      return false;
    }
    this.consumed = true;
    return true;
  }
}

export const NLI_PROVIDER_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({
  type: 'object',
  required: ['result'],
  properties: {
    result: {
      anyOf: [
        {
          type: 'object',
          required: ['version', 'kind', 'planId', 'summary', 'options'],
          properties: {
            version: {type: 'integer', enum: [1]},
            kind: {type: 'string', enum: ['plan']},
            planId: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.id},
            summary: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.summary},
            options: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              items: {
                type: 'object',
                required: ['optionId', 'label', 'rationale', 'assumptions', 'purpose', 'shellText'],
                properties: {
                  optionId: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.id},
                  label: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.label},
                  rationale: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.rationale},
                  assumptions: {
                    type: 'array',
                    maxItems: FIELD_LIMITS.assumptions,
                    items: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.assumption}
                  },
                  purpose: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.purpose},
                  shellText: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.shellText}
                },
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        },
        {
          type: 'object',
          required: ['version', 'kind', 'planId', 'question', 'choices'],
          properties: {
            version: {type: 'integer', enum: [1]},
            kind: {type: 'string', enum: ['clarification']},
            planId: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.id},
            question: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.question},
            choices: {
              type: 'array',
              minItems: 2,
              maxItems: 3,
              items: {
                type: 'object',
                required: ['optionId', 'label'],
                properties: {
                  optionId: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.id},
                  label: {type: 'string', minLength: 1, maxLength: FIELD_LIMITS.label}
                },
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        }
      ]
    }
  },
  additionalProperties: false
});
